/**
 * Contrato do Freela para os cupons de desconto do contratante (`/v1/admin/coupons`) e a busca de contratante do CRM
 * (`/v1/admin/crm/contractors/search`), usados pelos cupons da 1ª contratação (contrato §38). Só schemas zod e tipos; as
 * chamadas estão em `FreelaClient`. Respostas em `{ data }`; datas em ISO.
 */
import { z } from 'zod';
import type { CupomFreela } from '../../domain/voucher-rules';

const iso = z.string().min(1);

export const cupomSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  discountType: z.enum(['PERCENT', 'FIXED']),
  percentOff: z
    .number()
    .int()
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  amountOffInCents: z
    .number()
    .int()
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  contractorUserId: z.string().min(1),
  singleUse: z.boolean(),
  active: z.boolean(),
  expiresAt: iso
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  redeemedAt: iso
    .nullable()
    .optional()
    .transform((v) => v ?? null),
});

export const listaCuponsSchema = z.array(cupomSchema);

/** Item da busca do CRM. `module` = `bars-restaurants` | `home-services` (o Praça só aceita o primeiro). */
export const contratanteCrmSchema = z.object({
  userId: z.string().min(1),
  name: z.string(),
  city: z
    .string()
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  module: z.string(),
});
export const listaContratantesSchema = z.array(contratanteCrmSchema);
export type ContratanteCrm = z.infer<typeof contratanteCrmSchema>;

export type { CupomFreela };
