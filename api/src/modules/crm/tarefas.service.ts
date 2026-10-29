/**
 * CRM automático — tarefas do dia (contrato §47.3, arquitetura §2.7, achados 1, 9, 20, 28).
 *
 * `listar` carrega as linhas da praça em LOTE (sem N+1) e entrega tudo à `montarTarefas` (regras puras, Task 13).
 * `concluir` ("Feito" das tarefas que não são disparo): uma transação grava o evento de contato, `last_contact_at`, o próximo passo
 * e, se o lead não tinha dono, faz de quem fez o dono (desenho §12.2 U3). Lead em "Lead novo" (1) passa a "Contatado" (2) na mesma
 * transação, com os campos e o evento de etapa do `LeadsService.move()` (ruling A5: 1º contato = Contatado); o reaquecer (8) e as
 * outras etapas não mudam. O "Feito" do disparo (`POST /v1/sends/:id/mark`) segue sem mexer na etapa.
 */
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '../../common/auth/auth-user';
import { PrismaService } from '../../common/database/prisma.service';
import { isUuid } from '../../common/ids/uuid';
import { addDays, todaySp } from '../../common/time/dates';
import { FUNNEL_STAGES } from '../../domain/catalog/funnel';
import { atSpHour } from '../../domain/send-schedule';
import {
  montarTarefas,
  type EnvioFila,
  type LeadTarefa,
  type ResultadoTarefas,
  type VisitaQuente,
} from '../../domain/crm-tarefas-rules';
import { FreelaClient } from '../freela/freela-client';
import type { TarefaFeitaDto } from './dto/crm.dto';

/** Visitas encerradas olhadas para `hot_visit` (a regra usa 1 a 14 dias; 15 dá folga ao fuso). */
const DIAS_VISITAS = 15;
/** Passo próprio que o motor de cadência grava em `next_step_what` quando a tarefa da cadência não tem texto. */
const PASSOS_PADRAO_CADENCIA = ['Ligação da cadência', 'Ligar para confirmar presença'];
const CONTATOS = ['call', 'msg_out', 'msg_in', 'visit'];
const ETAPA_LEAD_NOVO = 1;
const ETAPA_CONTATADO = 2;
/** O mesmo nome que o `LeadsService.move()` escreve no evento de etapa. */
const nomeDaEtapa = (n: number): string => FUNNEL_STAGES.find((s) => s.n === n)?.name ?? '?';
const TEXTO_PADRAO: Record<TarefaFeitaDto['kind'], string> = {
  call: 'Ligação feita (tarefa do dia).',
  msg_out: 'Mensagem enviada (tarefa do dia).',
  msg_in: 'Resposta recebida (tarefa do dia).',
  visit: 'Visita feita (tarefa do dia).',
};

export interface RespostaTarefas extends ResultadoTarefas {
  day: string;
  praca_id: string;
  person: 'all' | 'me';
  entrada: { novos: number };
  freela_configured: boolean;
}

@Injectable()
export class TarefasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly freela: FreelaClient,
  ) {}

  async listar(pracaId: string | undefined, person: 'all' | 'me', eu: string, agora: Date = new Date()): Promise<RespostaTarefas> {
    if (!pracaId || !isUuid(pracaId)) throw this.pracaNaoEncontrada();
    const praca = await this.prisma.pracas.findUnique({ where: { id: pracaId }, select: { id: true } });
    if (!praca) throw this.pracaNaoEncontrada();

    const hoje = todaySp(agora);
    const fimDeHoje = atSpHour(addDays(hoje, 1), 0); // início de amanhã (Brasília)
    const doLead = { praca_id: pracaId, archived: false, is_test: false };

    const [leadsDb, enviosDb, cadenciaDb, visitasDb, cadastrosDb, contatosDb, tarefasCadencia] = await Promise.all([
      this.prisma.leads.findMany({
        where: doLead,
        select: {
          id: true, name: true, owner_id: true, stage: true, phone: true, archived: true, is_test: true, snooze_until: true,
          stage_since: true, last_contact_at: true, next_step_what: true, next_step_date: true, freela_hirings: true,
        },
      }),
      this.prisma.msg_sends.findMany({
        where: { disparo_id: { not: null }, mode: 'fila', status: 'fila', scheduled_at: { lt: fimDeHoje }, lead: doLead },
        select: { id: true, lead_id: true, text: true, scheduled_at: true, sent_at: true, disparo_id: true },
      }),
      this.prisma.msg_sends.findMany({
        where: { cadence_id: { not: null }, mode: 'fila', sent_at: { gte: atSpHour(hoje, 0), lt: fimDeHoje }, lead: doLead },
        select: { id: true, lead_id: true, text: true, scheduled_at: true, sent_at: true, cadence_id: true },
      }),
      this.prisma.field_visits.findMany({
        where: { checkout_at: { gte: new Date(agora.getTime() - DIAS_VISITAS * 86_400_000) }, lead: doLead },
        select: { lead_id: true, checkout_at: true, interest: true, consultant: { select: { name: true } } },
      }),
      this.prisma.field_signups.findMany({
        where: { first_vacancy_at: { not: null }, lead: doLead },
        select: { lead_id: true, first_vacancy_at: true },
      }),
      this.prisma.lead_events.groupBy({
        by: ['lead_id'],
        where: { kind: { in: CONTATOS }, author_id: { not: null }, lead: doLead },
        _max: { at: true },
      }),
      this.prisma.cadence_nodes.findMany({ where: { task: { not: null } }, select: { task: true }, distinct: ['task'] }),
    ]);

    // Nomes de origem das mensagens (um `IN` por tabela, nunca por mensagem).
    const idsDisparo = [...new Set(enviosDb.map((e) => e.disparo_id).filter((x): x is string => !!x))];
    const idsCadencia = [...new Set(cadenciaDb.map((e) => e.cadence_id).filter((x): x is string => !!x))];
    const [disparos, cadencias] = await Promise.all([
      idsDisparo.length ? this.prisma.disparos.findMany({ where: { id: { in: idsDisparo } }, select: { id: true, name: true } }) : [],
      idsCadencia.length ? this.prisma.cadences.findMany({ where: { id: { in: idsCadencia } }, select: { id: true, name: true } }) : [],
    ]);
    const nomeDisparo = new Map(disparos.map((d) => [d.id, d.name]));
    const nomeCadencia = new Map(cadencias.map((c) => [c.id, c.name]));

    const textosCadencia = new Set<string>([...PASSOS_PADRAO_CADENCIA, ...tarefasCadencia.map((n) => n.task!).filter(Boolean)]);
    const leads: LeadTarefa[] = leadsDb.map((l) => ({
      id: l.id,
      name: l.name,
      owner_id: l.owner_id,
      stage: l.stage,
      phone: l.phone || null,
      archived: l.archived,
      is_test: l.is_test,
      snooze_until: l.snooze_until,
      stage_since: l.stage_since,
      last_contact_day: l.last_contact_at ? todaySp(l.last_contact_at) : null,
      next_step_what: l.next_step_what,
      next_step_date: l.next_step_date,
      next_step_from_cadence: l.next_step_what !== null && textosCadencia.has(l.next_step_what),
      freela_hirings: l.freela_hirings,
    }));
    const envios: EnvioFila[] = enviosDb.map((e) => ({
      send_id: e.id,
      lead_id: e.lead_id,
      text: e.text,
      scheduled_at: e.scheduled_at,
      sent_at: e.sent_at,
      origin_label: `Disparo ${nomeDisparo.get(e.disparo_id!) ?? ''}`.trim(),
    }));
    const envios_cadencia: EnvioFila[] = cadenciaDb.map((e) => ({
      send_id: e.id,
      lead_id: e.lead_id,
      text: e.text,
      scheduled_at: e.scheduled_at,
      sent_at: e.sent_at,
      origin_label: `Cadência ${nomeCadencia.get(e.cadence_id!) ?? ''}`.trim(),
    }));
    const visitas: VisitaQuente[] = visitasDb
      .filter((v) => v.checkout_at)
      .map((v) => ({ lead_id: v.lead_id, checkout_at: v.checkout_at!, interest: v.interest, consultant_name: v.consultant.name }));
    const contatos_recentes = new Map<string, string>();
    for (const c of contatosDb) if (c._max.at) contatos_recentes.set(c.lead_id, todaySp(c._max.at));

    const resultado = montarTarefas(
      {
        leads,
        envios,
        envios_cadencia,
        visitas,
        cadastros: cadastrosDb.filter((c) => c.lead_id).map((c) => ({ lead_id: c.lead_id!, first_vacancy_at: c.first_vacancy_at })),
        contatos_recentes,
      },
      hoje,
      eu,
      person,
    );
    // Achado 28: "novos" = etapa 1 desta praça, fora de arquivados, testes e adiados (a fila de entrada, não um grupo de tarefa).
    const novos = leads.filter((l) => l.stage === 1 && !(l.snooze_until && l.snooze_until > hoje)).length;

    return {
      day: hoje,
      praca_id: pracaId,
      person,
      counts: resultado.counts,
      entrada: { novos },
      freela_configured: this.freela.isConfigured(),
      groups: resultado.groups,
    };
  }

  /**
   * "Feito" de uma tarefa (hot_visit, next_step, stalled, first_vacancy) ou da fila da Entrada (first_contact, sem lógica própria: a regra
   * do 1º contato abaixo vale para todas). Lead que já saiu da regra grava o contato assim mesmo.
   */
  async concluir(dto: TarefaFeitaDto, user: AuthUser): Promise<{ ok: true; lead_id: string }> {
    if (!isUuid(dto.lead_id)) throw this.leadNaoEncontrado();
    await this.prisma.$transaction(async (tx) => {
      const lead = await tx.leads.findUnique({
        where: { id: dto.lead_id },
        select: { id: true, archived: true, owner_id: true, stage: true },
      });
      if (!lead) throw this.leadNaoEncontrado();
      if (lead.archived) throw new ConflictException({ code: 'LEAD_ARCHIVED', message: 'Este lead está arquivado.' });
      const at = new Date();
      const texto = dto.text?.trim();
      // Mesma semântica do `LeadsService.addEvent`: `author_id` do usuário, sem `author_label` (o rótulo é só dos automáticos).
      await tx.lead_events.create({
        data: { lead_id: lead.id, at, author_id: user.id, kind: dto.kind, text: texto ? texto : TEXTO_PADRAO[dto.kind] },
      });
      const dados: Record<string, unknown> = { last_contact_at: at };
      if (dto.next_step) {
        dados.next_step_what = dto.next_step.what.trim();
        dados.next_step_date = dto.next_step.date;
      } else if (dto.task === 'next_step') {
        dados.next_step_what = null;
        dados.next_step_date = null;
      }
      await tx.leads.update({ where: { id: lead.id }, data: dados });
      // Sem dono, quem fez vira dono (condicional: se alguém assumiu entre a leitura e aqui, não pisa).
      if (lead.owner_id === null) await tx.leads.updateMany({ where: { id: lead.id, owner_id: null }, data: { owner_id: user.id } });
      // 1º contato: "Lead novo" → "Contatado", com os campos do `move()` para 1 → 2 (condicional: quem moveu no meio vence).
      if (lead.stage === ETAPA_LEAD_NOVO) {
        const m = await tx.leads.updateMany({
          where: { id: lead.id, stage: ETAPA_LEAD_NOVO, archived: false },
          data: { stage: ETAPA_CONTATADO, stage_since: todaySp(at), lost_reason: null, reheat_at: null },
        });
        if (m.count === 1) {
          await tx.lead_events.create({
            data: {
              lead_id: lead.id,
              at,
              author_id: user.id,
              kind: 'stage',
              text: `Mudou de etapa: ${nomeDaEtapa(ETAPA_LEAD_NOVO)} → ${nomeDaEtapa(ETAPA_CONTATADO)}`,
              stage_to: ETAPA_CONTATADO,
            },
          });
        }
      }
    });
    return { ok: true, lead_id: dto.lead_id };
  }

  private pracaNaoEncontrada(): NotFoundException {
    return new NotFoundException({ code: 'NOT_FOUND', message: 'Praça não encontrada.' });
  }
  private leadNaoEncontrado(): NotFoundException {
    return new NotFoundException({ code: 'NOT_FOUND', message: 'Lead não encontrado.' });
  }
}
