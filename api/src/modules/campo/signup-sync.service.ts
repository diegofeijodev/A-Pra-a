/**
 * Sincronização dos cadastros confirmados pelo Freela (F7, contrato §27).
 *
 * Invariantes deste arquivo:
 * - `field_signups` guarda FATOS de escrita única (datas de evento); nunca telefone, e-mail ou CNPJ do Freela
 *   (eles só existem em memória, para casar com cadastro/lead);
 * - nada que é humano é sobrescrito: vínculos existentes não mudam, o lead só ganha etapa (nunca perde),
 *   e o único campo de `field_company_signups` que muda é o estado de máquina (status/ids/activated_at);
 * - erro gravado em `field_signup_sync_state` é sempre sanitizado (sem corpo, telefone, URL ou token);
 * - rodar duas vezes o mesmo conteúdo não duplica nada (UNIQUE + escrita única + `stage < 5`).
 */
import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { todaySp } from '../../common/time/dates';
import { somenteDigitos } from '../../domain/company-signup-rules';
import {
  CAMPO_DA_REGRA,
  casarCadastro,
  classificar,
  diaBrasilia,
  escolherDesde,
  leadDeveSubir,
  mesclarEventos,
  sanitizarErroSync,
  variantesCnpj,
  type Casamento,
  type Eventos,
  type RegraConfirmacao,
} from '../../domain/signup-sync-rules';
import { phoneKey } from '../../common/phone/phone';
import { FreelaClient } from '../freela/freela-client';
import type { CadastroListado } from '../freela/freela-registrations';
import { RotasConfigService } from '../rotas/rotas-config.service';

export const MAX_PAGINAS_POR_CONSULTOR = 25;
const TAMANHO_PAGINA = 200;
const TEXTO_REGRA: Record<RegraConfirmacao, string> = {
  activated: 'primeiro acesso',
  first_vacancy: 'primeira vaga',
  first_job_completed: 'primeiro serviço concluído',
};

export interface OpcoesSync {
  janelaDias: number;
  maxPaginas?: number;
}

export interface ResumoSync {
  consultores: number;
  itens: number;
  erros: number;
  interrompido429: boolean;
}

interface ConsultorSync {
  id: string;
  praca_id: string;
  freela_consultant_id: string | null;
}

const toDate = (s: string | null | undefined): Date | null => {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};

const ETAPA_CADASTRADO = 5;
const NOMES_ETAPA: Record<number, string> = { 1: 'Prospecção', 2: 'Contatado', 3: 'Conversando', 4: 'Reunião' };

@Injectable()
export class SignupSyncService {
  private readonly log = new Logger(SignupSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly freela: FreelaClient,
    private readonly config: RotasConfigService,
  ) {}

  /** Uma rodada: todos os consultores com código no Freela (inclusive inativos). */
  async rodar(agora: Date, opcoes: OpcoesSync): Promise<ResumoSync> {
    const regra = (await this.config.cadastro()).confirmation_rule;
    const consultores = await this.prisma.field_consultants.findMany({
      where: { freela_consultant_id: { not: null } },
      select: { id: true, praca_id: true, freela_consultant_id: true },
      orderBy: { id: 'asc' },
    });
    const r: ResumoSync = { consultores: 0, itens: 0, erros: 0, interrompido429: false };
    for (const c of consultores) {
      const out = await this.sincronizarConsultor(c, agora, regra, opcoes);
      r.consultores++;
      r.itens += out.itens;
      if (out.erro) r.erros++;
      if (out.status429) {
        r.interrompido429 = true;
        break;
      }
    }
    return r;
  }

  /** Nunca lança: o erro vai (sanitizado) para o estado do consultor. */
  async sincronizarConsultor(
    c: ConsultorSync,
    agora: Date,
    regra: RegraConfirmacao,
    opcoes: OpcoesSync,
  ): Promise<{ itens: number; erro: boolean; status429: boolean }> {
    const maxPaginas = opcoes.maxPaginas ?? MAX_PAGINAS_POR_CONSULTOR;
    let itens = 0;
    try {
      const estado = await this.prisma.field_signup_sync_state.findUnique({ where: { consultant_id: c.id } });
      const maisAntigo = await this.prisma.field_signups.findFirst({
        where: { consultant_id: c.id, [CAMPO_DA_REGRA[regra]]: null },
        orderBy: { freela_created_at: 'asc' },
        select: { freela_created_at: true },
      });
      const desde = escolherDesde({
        agora,
        janelaDias: opcoes.janelaDias,
        watermark: estado?.watermark ?? null,
        maisAntigoSemEvento: maisAntigo?.freela_created_at ?? null,
      });

      let cursor: string | undefined;
      const vistos = new Set<string>();
      let maiorCriacao: Date | null = estado?.watermark ?? null;
      let completo = false;
      for (let pagina = 0; pagina < maxPaginas; pagina++) {
        const p = await this.freela.listRegistrations(c.freela_consultant_id!, {
          since: desde.toISOString(),
          limit: TAMANHO_PAGINA,
          ...(cursor ? { cursor } : {}),
        });
        for (const item of p.data) {
          const criado = await this.processarItem(c, item, regra, agora);
          if (criado) {
            itens++;
            if (!maiorCriacao || criado > maiorCriacao) maiorCriacao = criado;
          }
        }
        if (!p.nextCursor) {
          completo = true;
          break;
        }
        if (vistos.has(p.nextCursor)) break; // cursor que não anda: não vira laço infinito
        vistos.add(p.nextCursor);
        cursor = p.nextCursor;
      }

      await this.gravarEstado(c.id, {
        last_run_at: agora,
        last_count: itens,
        ...(completo
          ? { last_ok_at: agora, last_error_code: null, last_error: null, watermark: maiorCriacao }
          : { last_error_code: 'SYNC_INCOMPLETE', last_error: 'A listagem não terminou nesta rodada; continua na próxima.' }),
      });
      return { itens, erro: !completo, status429: false };
    } catch (e) {
      const s = sanitizarErroSync(e);
      this.log.warn(`consultor ${c.id}: sync falhou (${s.code})`);
      try {
        await this.gravarEstado(c.id, { last_run_at: agora, last_error_code: s.code, last_error: s.message, last_count: itens });
      } catch {
        this.log.error(`consultor ${c.id}: não foi possível gravar o estado do sync`);
      }
      return { itens, erro: true, status429: s.code === 'FREELA_429' };
    }
  }

  private async gravarEstado(consultantId: string, data: Prisma.field_signup_sync_stateUncheckedUpdateInput): Promise<void> {
    await this.prisma.field_signup_sync_state.upsert({
      where: { consultant_id: consultantId },
      update: data,
      create: { ...(data as Prisma.field_signup_sync_stateUncheckedCreateInput), consultant_id: consultantId },
    });
  }

  /** Devolve o `createdAt` do item (para o watermark) ou null se o item é inutilizável. */
  private async processarItem(c: ConsultorSync, item: CadastroListado, regra: RegraConfirmacao, agora: Date): Promise<Date | null> {
    const criado = toDate(item.createdAt);
    if (!criado) return null;
    const novos: Eventos = {
      activated_at: toDate(item.activatedAt),
      first_vacancy_at: toDate(item.firstVacancyAt),
      first_job_completed_at: toDate(item.firstJobCompletedAt),
    };

    await this.prisma.$transaction(async (tx) => {
      const atual = await tx.field_signups.findUnique({
        where: { consultant_id_freela_user_id: { consultant_id: c.id, freela_user_id: item.userId } },
      });
      const { valor, divergencias } = mesclarEventos(
        {
          activated_at: atual?.activated_at ?? null,
          first_vacancy_at: atual?.first_vacancy_at ?? null,
          first_job_completed_at: atual?.first_job_completed_at ?? null,
        },
        novos,
      );
      if (divergencias > 0) this.log.warn(`consultor ${c.id}: ${divergencias} data(s) divergente(s) do Freela ignoradas (vale a primeira gravada)`);

      // Cadastros iniciados pelo consultor: candidatos do MESMO consultor.
      const candidatos = await tx.field_company_signups.findMany({
        where: { consultant_id: c.id, OR: [{ freela_user_id: item.userId }, { freela_user_id: null }] },
        select: { id: true, freela_user_id: true, company_name: true, phone_masked: true, lead_id: true, status: true, activated_at: true, freela_contractor_id: true },
      });
      let casamento: Casamento = atual?.signup_id ? { tipo: 'linked', id: atual.signup_id } : casarCadastro({ userId: item.userId, companyName: item.companyName, phone: item.phone }, candidatos);
      const idLigado = casamento.tipo === 'linked' ? casamento.id : null;
      const cadastro = idLigado ? candidatos.find((x) => x.id === idLigado) : undefined;
      if (idLigado && !cadastro && !atual?.signup_id) casamento = { tipo: 'none' };

      // Lead: o do cadastro; senão praça + telefone/CNPJ, só se for um único.
      let leadId = atual?.lead_id ?? cadastro?.lead_id ?? null;
      let leadAmbiguo = false;
      if (!leadId) {
        const achados = await this.leadsCandidatos(tx, c.praca_id, item);
        if (achados.length === 1) leadId = achados[0]!;
        else if (achados.length > 1) leadAmbiguo = true;
      }

      const signupId = atual?.signup_id ?? (casamento.tipo === 'linked' ? casamento.id : null);
      const matchStatus =
        casamento.tipo === 'ambiguous' || leadAmbiguo ? 'ambiguous' : signupId || leadId ? 'linked' : 'none';
      const dias = {
        created_day: atual?.created_day ?? diaBrasilia(criado),
        activated_day: valor.activated_at ? diaBrasilia(valor.activated_at) : null,
        first_vacancy_day: valor.first_vacancy_at ? diaBrasilia(valor.first_vacancy_at) : null,
        first_job_day: valor.first_job_completed_at ? diaBrasilia(valor.first_job_completed_at) : null,
      };
      const dados = {
        freela_contractor_id: atual?.freela_contractor_id ?? item.contractorId ?? null,
        company_name: item.companyName,
        source: item.source ?? null,
        ...valor,
        ...dias,
        signup_id: signupId,
        lead_id: leadId,
        match_status: matchStatus,
        synced_at: agora,
      };
      if (atual) await tx.field_signups.update({ where: { id: atual.id }, data: dados });
      else await tx.field_signups.create({ data: { consultant_id: c.id, freela_user_id: item.userId, freela_created_at: criado, first_seen_at: agora, ...dados } });

      // Reconciliação do cadastro iniciado pelo consultor (estado de máquina apenas).
      if (cadastro && signupId) {
        const mudanca: Prisma.field_company_signupsUncheckedUpdateInput = {};
        if (!cadastro.freela_user_id) mudanca.freela_user_id = item.userId;
        if (!cadastro.freela_contractor_id && item.contractorId) mudanca.freela_contractor_id = item.contractorId;
        if (valor.activated_at) {
          if (cadastro.status !== 'activated') mudanca.status = 'activated';
          if (!cadastro.activated_at) mudanca.activated_at = valor.activated_at;
        } else if (cadastro.status === 'creating' || cadastro.status === 'failed') {
          mudanca.status = 'pending';
        }
        if (Object.keys(mudanca).length > 0) await tx.field_company_signups.update({ where: { id: cadastro.id }, data: mudanca });
      }

      // Lead → "Cadastrado" (5): só confirmado pela regra vigente; a guarda no WHERE torna idempotente.
      const cls = classificar(valor, regra);
      if (leadId && cls.confirmado && matchStatus !== 'ambiguous') {
        const lead = await tx.leads.findUnique({ where: { id: leadId }, select: { stage: true, archived: true, is_test: true } });
        if (lead && leadDeveSubir(lead, true)) {
          const r = await tx.leads.updateMany({
            where: { id: leadId, stage: { lt: ETAPA_CADASTRADO }, archived: false, is_test: false },
            data: { stage: ETAPA_CADASTRADO, stage_since: todaySp(agora) },
          });
          if (r.count === 1) {
            await tx.lead_events.create({
              data: {
                lead_id: leadId,
                at: agora,
                kind: 'stage',
                author_label: 'Freela (sincronização)',
                stage_to: ETAPA_CADASTRADO,
                text: `Cadastro confirmado no Freela (${TEXTO_REGRA[regra]}, ${cls.dia}). Etapa: ${NOMES_ETAPA[lead.stage] ?? lead.stage} → Cadastrado.`,
              },
            });
          }
        }
      }
    });
    return criado;
  }

  private async leadsCandidatos(tx: Prisma.TransactionClient, pracaId: string, item: CadastroListado): Promise<string[]> {
    const key = phoneKey(item.phone);
    const cnpjs = variantesCnpj(item.cnpj);
    const ou: Prisma.leadsWhereInput[] = [];
    if (somenteDigitos(item.phone).length >= 10 && key.length === 9) ou.push({ phone_key: key });
    if (cnpjs.length) ou.push({ cnpj: { in: cnpjs } });
    if (!ou.length) return [];
    const r = await tx.leads.findMany({ where: { praca_id: pracaId, OR: ou }, select: { id: true }, take: 2 });
    return r.map((l) => l.id);
  }
}
