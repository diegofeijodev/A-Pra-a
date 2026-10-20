/**
 * Motivos de recusa da visita (contrato §30.2). ESPELHO de `api/src/domain/catalog/refusal.ts`:
 * mesma lista fechada, mesmas chaves. Lista padrão, ajustável — o dono confirma os motivos.
 */
export const MOTIVOS_RECUSA = [
  { key: 'ja_usa_outro_app', label: 'Já usa outro app' },
  { key: 'sem_interesse_momento', label: 'Sem interesse no momento' },
  { key: 'nao_contrata_freelancers', label: 'Não contrata freelancers' },
  { key: 'decisor_ausente', label: 'Dono/decisor ausente' },
  { key: 'preco', label: 'Preço' },
  { key: 'outro', label: 'Outro' },
] as const;

/** Fluxo `simples` (contrato §31.5): as 6 de antes + "Sem demanda" (Lovable `MOTIVOS_NAO`). O questionário completo segue com `MOTIVOS_RECUSA`. */
export const MOTIVOS_RECUSA_SIMPLES = [...MOTIVOS_RECUSA, { key: 'sem_demanda', label: 'Sem demanda' }] as const;

export type MotivoRecusa = (typeof MOTIVOS_RECUSA_SIMPLES)[number]['key'];

export const rotuloMotivoRecusa = (key: string | null | undefined): string | null =>
  MOTIVOS_RECUSA_SIMPLES.find((m) => m.key === key)?.label ?? null;

/** A pergunta do motivo só aparece numa conversa com interesse "nenhum" (espelho do servidor). */
export const pedeMotivoRecusa = (r: { interest: string | null; outcome?: string | null }): boolean =>
  r.interest === 'nenhum' && (r.outcome ?? 'conversa') === 'conversa';
