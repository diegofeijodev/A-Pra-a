/** Projeção e encerramento automático do intervalo (contrato §37.4–§37.5). Sem dependência de serviço: jornadas e visitas importam daqui. */
import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../../common/database/prisma.service';
import { fimDaPausa, minutosDaPausa, type MotivoFimIntervalo } from '../../domain/intervalo-rules';

export interface BreakRow {
  id: string;
  client_id: string;
  journey_id: string;
  consultant_id: string;
  started_at: Date;
  ended_at: Date | null;
  end_reason: string | null;
  auto_closed: boolean;
  clock_adjusted: boolean;
}

/** `BreakView` (contrato §37.4). */
export interface BreakView {
  id: string;
  client_id: string;
  journey_id: string;
  started_at: string;
  ended_at: string | null;
  /** Fim − início (o aberto até agora), inteiro. */
  minutes: number;
  end_reason: string | null;
  auto_closed: boolean;
  clock_adjusted: boolean;
}

export const breakView = (b: BreakRow, agora: Date): BreakView => ({
  id: b.id,
  client_id: b.client_id,
  journey_id: b.journey_id,
  started_at: b.started_at.toISOString(),
  ended_at: b.ended_at?.toISOString() ?? null,
  minutes: minutosDaPausa(b, agora),
  end_reason: b.end_reason,
  auto_closed: b.auto_closed,
  clock_adjusted: b.clock_adjusted,
});

type Db = Prisma.TransactionClient | PrismaService;

/**
 * Encerra o intervalo aberto da jornada (check-in, fim da jornada, meia-noite — contrato §37.5). O fim nunca fica antes do início.
 * Condicional (`ended_at: null`): duas chamadas simultâneas encerram uma vez só.
 */
export async function encerrarIntervaloAberto(db: Db, journeyId: string, fim: Date, motivo: MotivoFimIntervalo): Promise<void> {
  const aberto = await db.field_journey_breaks.findFirst({ where: { journey_id: journeyId, ended_at: null }, select: { id: true, started_at: true } });
  if (!aberto) return;
  await db.field_journey_breaks.updateMany({
    where: { id: aberto.id, ended_at: null },
    data: { ended_at: fimDaPausa(aberto.started_at, fim), end_reason: motivo, ...(motivo === 'auto' ? { auto_closed: true } : {}) },
  });
}

