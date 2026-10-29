/**
 * CRM automático — A4: lead sem resposta vira Perdido (arquitetura achado 10, contrato §47.2).
 *
 * Uma vez por dia (o agendador é a Task 11): lead na etapa 2 "Contatado" parado há `DIAS_SEM_RESPOSTA` dias, sem inscrição
 * `ativo|aguardando`, sem adiamento e sem próximo passo de hoje em diante, vai para a etapa 8 com o motivo "não respondeu"
 * e volta para a fila em `DIAS_REAQUECER` dias — os mesmos campos do `LeadsService.move()`.
 *
 * Uma transação por lead: a trava por pessoa é a MESMA do `autoEnroll` (a matrícula automática não entra no meio), as
 * inscrições são relidas já com a trava, e o `updateMany` carrega `stage: 2` e o `stage_since` lido (quem mexeu no lead
 * entre a leitura e a escrita vence). Evento com `auto_key` por `ON CONFLICT DO NOTHING` (`criarEventoAuto`: um P2002 abortaria a transação).
 * `rodar` nunca lança: a falha de um lead não derruba os outros e a rodada registra o primeiro erro, saneado.
 */
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { CRM_FLAGS, type FlagsCrm } from '../../common/flags/crm.flags';
import { addDays, todaySp } from '../../common/time/dates';
import { AUTOR_AUTOMATICO, DIAS_REAQUECER } from '../../domain/catalog/crm';
import { candidatoSemResposta } from '../../domain/crm-etapas-rules';
import { lastContactDate, stalledDays } from '../../domain/lead-rules';
import { PARA_LISTA } from '../leads/leads.service';
import { criarEventoAuto } from './etapas-automaticas.service';
import { erroDaRodada, registrarRodada } from './rodadas';

const ETAPA_CONTATADO = 2;
const ETAPA_PERDIDO = 8;
const MOTIVO = 'não respondeu';
const EM_CADENCIA = ['ativo', 'aguardando'];

const diaMes = (dia: string): string => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;

@Injectable()
export class SemRespostaService {
  private readonly log = new Logger(SemRespostaService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(CRM_FLAGS) private readonly crm?: FlagsCrm,
  ) {}

  async rodar(agora: Date): Promise<{ candidatos: number; perdidos: number }> {
    const r = { candidatos: 0, perdidos: 0 };
    if (!this.crm?.auto_lost) return r;
    let erros = 0;
    let primeiroErro: unknown = null;
    try {
      const hoje = todaySp(agora);
      const leads = await this.prisma.leads.findMany({
        where: { stage: ETAPA_CONTATADO, archived: false, is_test: false },
        select: {
          id: true,
          stage: true,
          stage_since: true,
          archived: true,
          is_test: true,
          classe: true,
          last_contact_at: true,
          snooze_until: true,
          next_step_date: true,
          ...PARA_LISTA,
          enrollments: { where: { status: { in: EM_CADENCIA } }, select: { status: true }, take: 1 },
        },
        orderBy: { id: 'asc' },
      });
      for (const l of leads) {
        const rules = {
          stage: l.stage,
          stage_since: l.stage_since,
          archived: l.archived,
          classe: l.classe,
          last_contact_at: l.last_contact_at ? l.last_contact_at.toISOString() : null,
          events: l.events.map((e) => ({ at: e.at.toISOString(), kind: e.kind })),
        };
        const parados = stalledDays(rules, hoje);
        if (
          !candidatoSemResposta(
            { ...l, stalled_days: parados, em_cadencia: l.enrollments.length > 0 },
            hoje,
          )
        )
          continue;
        r.candidatos++;
        try {
          const ultimo = lastContactDate(rules) ?? l.stage_since;
          if (await this.perder(l, ultimo, parados, hoje, agora)) r.perdidos++;
        } catch (e) {
          erros++;
          primeiroErro ??= e;
          this.log.warn(`A4 falhou em um lead: ${erroDaRodada(e)}`);
        }
      }
    } catch (e) {
      erros++;
      primeiroErro ??= e;
      this.log.error(`A4 falhou: ${erroDaRodada(e)}`);
    }
    try {
      await registrarRodada(this.prisma, {
        job: 'sem_resposta',
        started_at: agora,
        ok: erros === 0,
        summary: { candidatos: r.candidatos, perdidos: r.perdidos },
        ...(primeiroErro ? { error: erroDaRodada(primeiroErro) } : {}),
      });
    } catch (e) {
      this.log.error(`A4: rodada não gravada: ${erroDaRodada(e)}`);
    }
    return r;
  }

  /** Move um lead (uma transação). `true` = moveu; `false` = alguém chegou antes (inscrição nova ou lead mexido). */
  private async perder(
    l: { id: string; stage_since: string; snooze_until: string | null; next_step_date: string | null },
    ultimo: string,
    parados: number,
    hoje: string,
    agora: Date,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`cadence-enroll:${l.id}`}))`;
      if ((await tx.enrollments.count({ where: { lead_id: l.id, status: { in: EM_CADENCIA } } })) > 0) return false;
      const m = await tx.leads.updateMany({
        where: {
          id: l.id,
          stage: ETAPA_CONTATADO,
          stage_since: l.stage_since,
          archived: false,
          is_test: false,
          snooze_until: l.snooze_until,
          next_step_date: l.next_step_date,
        },
        data: {
          stage: ETAPA_PERDIDO,
          stage_since: hoje,
          lost_reason: MOTIVO,
          reheat_at: addDays(hoje, DIAS_REAQUECER),
        },
      });
      if (m.count !== 1) return false;
      // Evento já gravado (mesma `auto_key`) = nada a fazer; o lead moveu do mesmo jeito.
      await criarEventoAuto(tx, {
        lead_id: l.id,
        at: agora,
        kind: 'stage',
        author_id: null,
        author_label: AUTOR_AUTOMATICO,
        stage_to: ETAPA_PERDIDO,
        auto_key: `a4:${l.id}:${l.stage_since}`,
        text:
          `Mudou de etapa: Contatado → Perdido / reaquecer · motivo: ${MOTIVO} ` +
          `(último contato em ${diaMes(ultimo)}, ${parados} dias sem resposta).`,
      });
      return true;
    });
  }
}
