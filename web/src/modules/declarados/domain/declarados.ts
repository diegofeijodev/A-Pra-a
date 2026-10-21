/**
 * Cadastros declarados (S3, contrato §32.5–§32.7) — tipos do fio e rótulos. Quem calcula status, limite e
 * divergência é o servidor; aqui só se escreve em português o que ele devolveu.
 */
import { z } from 'zod';

export const STATUS = ['confirmed', 'pending', 'unmatched', 'voided'] as const;
export type StatusDeclaracao = (typeof STATUS)[number];

export const MOTIVOS = ['not_confirmed', 'duplicate', 'admin_review', 'fraud'] as const;
export type MotivoAnulacao = (typeof MOTIVOS)[number];

export const ROTULO_MOTIVO: Record<MotivoAnulacao, string> = {
  not_confirmed: 'Não confirmado pelo Freela',
  duplicate: 'Cadastro duplicado',
  admin_review: 'Revisão da equipe',
  fraud: 'Suspeita de fraude',
};

export const ROTULO_STATUS: Record<StatusDeclaracao, string> = {
  confirmed: 'Confirmado pelo Freela',
  pending: 'Ligado, aguardando o Freela',
  unmatched: 'Sem correspondência no Freela',
  voided: 'Anulado',
};

export const FILTROS = [
  { valor: '', rotulo: 'Todos' },
  { valor: 'unmatched', rotulo: 'Sem correspondência' },
  { valor: 'pending', rotulo: 'Aguardando o Freela' },
  { valor: 'confirmed', rotulo: 'Confirmados' },
  { valor: 'over_cap', rotulo: 'Acima do limite' },
  { valor: 'voided', rotulo: 'Anulados' },
] as const;

const totaisSchema = z.object({
  declared: z.number().int(),
  confirmed: z.number().int(),
  pending_confirmation: z.number().int(),
  unmatched: z.number().int(),
  voided: z.number().int(),
  over_cap: z.number().int(),
  divergence_pct: z.number().int(),
});
export type TotaisDeclaracao = z.infer<typeof totaisSchema>;

export const linhaSchema = z.object({
  id: z.string(),
  consultant_id: z.string(),
  consultant_name: z.string(),
  praca_id: z.string(),
  declared_day: z.string(),
  declared_at: z.string(),
  company_name: z.string(),
  lead_id: z.string(),
  visit_id: z.string(),
  rule_version: z.number().int().nullable(),
  paid_by: z.enum(['declared', 'freela_confirmed']),
  status: z.enum(STATUS),
  over_cap: z.boolean(),
  confirmed_by_other_consultant: z.boolean(),
  void: z.object({ reason: z.string(), note: z.string(), voided_at: z.string(), voided_by: z.string().nullable() }).nullable(),
});
export type LinhaDeclaracao = z.infer<typeof linhaSchema>;

export const relatorioSchema = z.object({
  from: z.string(),
  to: z.string(),
  source: z.string(),
  rows: z.array(linhaSchema),
  truncated: z.boolean().optional(),
  totals: totaisSchema,
  by_consultant: z.array(totaisSchema.extend({ consultant_id: z.string(), name: z.string(), praca_id: z.string() })),
  conta: z.array(z.string()),
});
export type RelatorioDeclarados = z.infer<typeof relatorioSchema>;

/** "Pago como declarado" / "Pago só quando o Freela confirmar" — quem paga esta declaração pela regra do dia. */
export const textoPagamento = (l: Pick<LinhaDeclaracao, 'paid_by' | 'status' | 'over_cap'>): string => {
  if (l.status === 'voided') return 'Anulado: não entra na conta.';
  if (l.over_cap) return 'Acima do limite diário: não entra na conta.';
  return l.paid_by === 'declared' ? 'Paga ao consultor pela declaração.' : 'Só registrada: a regra do dia paga pelo Freela.';
};

export const textoDivergencia = (t: Pick<TotaisDeclaracao, 'declared' | 'voided' | 'unmatched' | 'divergence_pct'>): string => {
  const base = t.declared - t.voided;
  return base > 0 ? `${t.unmatched} sem correspondência ÷ ${base} válidas = ${t.divergence_pct}%` : 'sem declarações válidas';
};
