/**
 * Rodadas dos trabalhos do CRM automático (contrato §47.4): uma linha por execução em `crm_automation_runs`.
 * Helper do módulo `crm/` (quem está fora dele, como o gancho do A1 em `places/`, grava direto pelo Prisma).
 * O `error` gravado é sempre saneado (`erroDaRodada`): nunca corpo, telefone, URL ou token.
 */
import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../../common/database/prisma.service';
import { addDays } from '../../common/time/dates';
import { DIAS_RETENCAO_RODADAS, type JobCrm } from '../../domain/catalog/crm';
import { atSpHour } from '../../domain/send-schedule';
import { sanitizarErroSync } from '../../domain/signup-sync-rules';

type Db = PrismaService | Prisma.TransactionClient;

const DIA_MS = 86_400_000;

export interface RodadaNova {
  job: JobCrm;
  ref?: string;
  started_at: Date;
  ok: boolean;
  summary: Record<string, unknown>;
  /** Já saneado (`erroDaRodada`). */
  error?: string;
}

export interface Rodada {
  started_at: Date;
  finished_at: Date | null;
  ok: boolean;
  summary: Prisma.JsonValue;
  error: string | null;
}

/**
 * Texto de erro que pode ir para o banco e para a tela Automações: o do Freela (`sanitizarErroSync`) ou, para qualquer outro,
 * um genérico sem a mensagem original (que pode trazer telefone, SQL ou URL). O código do Prisma (`P2034`…) fica: ajuda a
 * achar a causa e não carrega dado de ninguém.
 */
export function erroDaRodada(e: unknown): string {
  const s = sanitizarErroSync(e);
  if (s.code !== 'SYNC_ERROR') return `${s.code}: ${s.message}`;
  const code = (e as { code?: unknown } | null)?.code;
  return typeof code === 'string' && /^P\d{4}$/.test(code) ? `CRM_ERROR: A rodada falhou (${code}).` : 'CRM_ERROR: A rodada falhou.';
}

export async function registrarRodada(db: Db, r: RodadaNova): Promise<void> {
  await db.crm_automation_runs.create({
    data: {
      job: r.job,
      ref: r.ref ?? null,
      started_at: r.started_at,
      finished_at: new Date(),
      ok: r.ok,
      summary: r.summary as Prisma.InputJsonValue,
      error: r.error ?? null,
    },
  });
}

/** Houve rodada ok do trabalho no dia de Brasília `dia` ("YYYY-MM-DD")? (A4 roda uma vez por dia e sobrevive a reinício.) */
export async function rodadaOkNoDia(db: Db, job: JobCrm, dia: string): Promise<boolean> {
  const n = await db.crm_automation_runs.count({
    where: { job, ok: true, started_at: { gte: atSpHour(dia, 0), lt: atSpHour(addDays(dia, 1), 0) } },
  });
  return n > 0;
}

export async function ultimaRodada(db: Db, job: JobCrm): Promise<Rodada | null> {
  return db.crm_automation_runs.findFirst({
    where: { job },
    orderBy: { started_at: 'desc' },
    select: { started_at: true, finished_at: true, ok: true, summary: true, error: true },
  });
}

/** Apaga as rodadas com mais de `DIAS_RETENCAO_RODADAS` dias; devolve quantas saíram. */
export async function limparRodadasAntigas(db: Db, agora: Date): Promise<number> {
  const r = await db.crm_automation_runs.deleteMany({
    where: { started_at: { lt: new Date(agora.getTime() - DIAS_RETENCAO_RODADAS * DIA_MS) } },
  });
  return r.count;
}
