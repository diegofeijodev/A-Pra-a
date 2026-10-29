/**
 * CRM automático — página Automações e selos do funil (contrato §47.3, arquitetura achados 8, 12, 21, 23, 24, 25 e §2.7).
 * Só leitura. `blocked_by` quem decide é o servidor (a tela não adivinha): 'freela' (conta não configurada) ou 'signup_sync'
 * (a leitura de cadastros do Freela, `FIELD_SIGNUP_SYNC_ENABLED`, está desligada). O e-mail da conta do Freela nunca sai daqui,
 * e o `error` da rodada só vai para admin.
 *
 * `FIELD_SIGNUP_SYNC_ENABLED` é lido do ambiente (`validateEnv`) e não do token `SIGNUP_SYNC_OPCOES` do `campo/`: o `crm/` só
 * importa módulos folha e `campo/` não é um deles.
 */
import { Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { validateEnv } from '../../common/config/env.validation';
import { PrismaService } from '../../common/database/prisma.service';
import { CRM_DESLIGADAS, CRM_FLAGS, type FlagsCrm } from '../../common/flags/crm.flags';
import { isUuid } from '../../common/ids/uuid';
import { JOBS_CRM, type JobCrm } from '../../domain/catalog/crm';
import { autoriaDoEvento } from '../../domain/crm-resumo-rules';
import { FreelaClient } from '../freela/freela-client';
import { ultimaRodada } from './rodadas';

const DIA_MS = 86_400_000;

export interface JobAutomacao {
  key: JobCrm;
  enabled: boolean;
  needs_freela: boolean;
  blocked_by: 'freela' | 'signup_sync' | null;
  last_run: { at: string; ok: boolean; summary: unknown; error?: string } | null;
  last_7d: Record<string, number>;
}

export interface RespostaAutomacoes {
  freela_configured: boolean;
  send_mode: string;
  jobs: JobAutomacao[];
  cadences: { id: string; name: string; entry: string; paused: boolean; active_enrollments: number }[];
  warnings: string[];
}

export interface SeloFunil {
  lead_id: string;
  last_stage_auto: boolean;
  freela_hirings: number | null;
}

export const AVISO_AUTO_LEADS_COM_CADENCIA =
  'Os achados da busca entram sozinhos no funil e há uma cadência de entrada “Novo” ativa: cada lead novo recebe mensagem sem ninguém ' +
  'ter conversado antes (risco de mensagem fria em massa). Com “Via Freela” essas mensagens saem automaticamente. ' +
  'Pause a cadência de “Novo” ou confira a lista antes de ligar.';

/** Soma, por chave, os campos numéricos do `summary` (objeto aninhado vira `pai.filho`). */
function somarSummary(acc: Record<string, number>, s: unknown, prefixo = ''): void {
  if (!s || typeof s !== 'object' || Array.isArray(s)) return;
  for (const [k, v] of Object.entries(s as Record<string, unknown>)) {
    const chave = prefixo ? `${prefixo}.${k}` : k;
    if (typeof v === 'number' && Number.isFinite(v)) acc[chave] = (acc[chave] ?? 0) + v;
    else if (v && typeof v === 'object') somarSummary(acc, v, chave);
  }
}

@Injectable()
export class AutomacoesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly freela: FreelaClient,
    @Optional() @Inject(CRM_FLAGS) private readonly flags: FlagsCrm = CRM_DESLIGADAS,
  ) {}

  async automacoes(isAdmin: boolean, agora: Date = new Date()): Promise<RespostaAutomacoes> {
    const configurado = this.freela.isConfigured();
    const syncLigado = validateEnv(process.env).FIELD_SIGNUP_SYNC_ENABLED === 'true';
    const desde = new Date(agora.getTime() - 7 * DIA_MS);

    const [ultimas, rodadas7d, config, cadencias, ativas] = await Promise.all([
      Promise.all(JOBS_CRM.map((j) => ultimaRodada(this.prisma, j))),
      this.prisma.crm_automation_runs.findMany({ where: { started_at: { gte: desde } }, select: { job: true, summary: true } }),
      this.prisma.app_settings.findUnique({ where: { id: 1 }, select: { mode: true } }),
      this.prisma.cadences.findMany({ select: { id: true, name: true, entry: true, paused: true }, orderBy: { created_at: 'asc' } }),
      this.prisma.enrollments.groupBy({ by: ['cadence_id'], where: { status: 'ativo' }, _count: { _all: true } }),
    ]);

    const jobs: JobAutomacao[] = JOBS_CRM.map((key, i) => {
      const r = ultimas[i] ?? null;
      const last7: Record<string, number> = {};
      for (const x of rodadas7d) {
        if (x.job !== key) continue;
        if ((x.summary as { nao_configurado?: unknown } | null)?.nao_configurado === true) continue;
        somarSummary(last7, x.summary);
      }
      return {
        key,
        enabled: this.ligado(key),
        needs_freela: key === 'etapas_cadastro' || key === 'quadro_freela',
        blocked_by: this.bloqueio(key, configurado, syncLigado),
        last_run: r
          ? { at: (r.finished_at ?? r.started_at).toISOString(), ok: r.ok, summary: r.summary, ...(isAdmin && r.error ? { error: r.error } : {}) }
          : null,
        last_7d: last7,
      };
    });

    const porCadencia = new Map(ativas.map((a) => [a.cadence_id, a._count._all]));
    const cadences = cadencias.map((c) => ({ id: c.id, name: c.name, entry: c.entry, paused: c.paused, active_enrollments: porCadencia.get(c.id) ?? 0 }));
    const warnings: string[] = [];
    if (this.flags.auto_leads && cadences.some((c) => c.entry === 'stage_novo' && !c.paused)) warnings.push(AVISO_AUTO_LEADS_COM_CADENCIA);

    return { freela_configured: configurado, send_mode: config?.mode ?? 'fila', jobs, cadences, warnings };
  }

  /** Selos dos cartões do funil: só leads com algo a mostrar (achado 25). */
  async selos(pracaId: string | undefined): Promise<{ items: SeloFunil[] }> {
    if (!pracaId || !isUuid(pracaId)) throw this.pracaNaoEncontrada();
    const praca = await this.prisma.pracas.findUnique({ where: { id: pracaId }, select: { id: true } });
    if (!praca) throw this.pracaNaoEncontrada();

    const [ultimos, contratacoes] = await Promise.all([
      this.prisma.$queryRaw<{ lead_id: string; author_id: string | null; author_label: string | null }[]>(Prisma.sql`
        SELECT DISTINCT ON (e.lead_id) e.lead_id, e.author_id, e.author_label
        FROM lead_events e JOIN leads l ON l.id = e.lead_id
        WHERE l.praca_id = ${pracaId}::uuid AND l.archived = false AND l.is_test = false AND e.stage_to IS NOT NULL
        ORDER BY e.lead_id, e.at DESC, e.id DESC`),
      this.prisma.leads.findMany({
        where: { praca_id: pracaId, archived: false, is_test: false, freela_hirings: { gt: 0 } },
        select: { id: true, freela_hirings: true },
      }),
    ]);

    const itens = new Map<string, SeloFunil>();
    for (const u of ultimos) {
      if (autoriaDoEvento(u.author_id, u.author_label) === 'automatico') itens.set(u.lead_id, { lead_id: u.lead_id, last_stage_auto: true, freela_hirings: null });
    }
    for (const c of contratacoes) {
      const atual = itens.get(c.id) ?? { lead_id: c.id, last_stage_auto: false, freela_hirings: null };
      itens.set(c.id, { ...atual, freela_hirings: c.freela_hirings });
    }
    return { items: [...itens.values()] };
  }

  private ligado(job: JobCrm): boolean {
    switch (job) {
      case 'auto_leads_busca': return this.flags.auto_leads;
      case 'etapas_cadastro': return this.flags.auto_stages;
      case 'quadro_freela': return this.flags.freela_pipeline;
      case 'sem_resposta': return this.flags.auto_lost;
    }
  }

  private bloqueio(job: JobCrm, freelaConfigurado: boolean, syncLigado: boolean): 'freela' | 'signup_sync' | null {
    if (job === 'quadro_freela') return freelaConfigurado ? null : 'freela';
    if (job === 'etapas_cadastro') return !freelaConfigurado ? 'freela' : !syncLigado ? 'signup_sync' : null;
    return null;
  }

  private pracaNaoEncontrada(): NotFoundException {
    return new NotFoundException({ code: 'NOT_FOUND', message: 'Praça não encontrada.' });
  }
}
