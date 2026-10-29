/**
 * Contrato do quadro de contratantes do Freela (`GET /v1/admin/crm/pipeline`, A3).
 * Só o schema zod e o achatamento; a chamada está em `FreelaClient`. O corpo é
 * `{ columns: [{ stage, title, count, cards }], totalContractors }`; campos que
 * o Praça não usa (módulos, ramo, mensagens enviadas…) são ignorados.
 */
import { z } from 'zod';
import type { CartaoFreela } from '../../domain/freela-cartao';

const cartaoSchema = z.object({
  userId: z.string().min(1),
  name: z.string(),
  city: z.string().nullish().transform((v) => v ?? null),
  state: z.string().nullish().transform((v) => v ?? null),
  whatsappPhone: z.string().nullish().transform((v) => v ?? null),
  hiringsCount: z.number().int().min(0),
  registeredAt: z.string().min(1),
});

export const quadroSchema = z.object({
  columns: z.array(z.object({ stage: z.string(), cards: z.array(cartaoSchema) })),
  totalContractors: z.number().optional(),
});

/** Todas as colunas num vetor só; a etapa do Freela não importa, o Praça refaz a conta por `hiringsCount`. */
export function achatarQuadro(data: unknown): CartaoFreela[] {
  return quadroSchema.parse(data).columns.flatMap((c) => c.cards);
}
