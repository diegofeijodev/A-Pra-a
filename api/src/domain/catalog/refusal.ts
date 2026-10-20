/**
 * Motivos de recusa da visita (contrato §30.2). Conjunto FECHADO no código.
 * LISTA PADRÃO, AJUSTÁVEL: o dono confirma os motivos; para mudar, edite aqui
 * (e o espelho de rótulos em `web/src/modules/campo/domain/recusa.ts`).
 * A chave (slug) é o que fica gravado — não renomeie uma chave já usada.
 */
export const MOTIVOS_RECUSA = [
  { key: 'ja_usa_outro_app', label: 'Já usa outro app' },
  { key: 'sem_interesse_momento', label: 'Sem interesse no momento' },
  { key: 'nao_contrata_freelancers', label: 'Não contrata freelancers' },
  { key: 'decisor_ausente', label: 'Dono/decisor ausente' },
  { key: 'preco', label: 'Preço' },
  { key: 'outro', label: 'Outro' },
] as const;

export type MotivoRecusa = (typeof MOTIVOS_RECUSA)[number]['key'];

export const CHAVES_MOTIVO_RECUSA: readonly string[] = MOTIVOS_RECUSA.map((m) => m.key);

/** Motivo que aceita texto livre curto. */
export const MOTIVO_RECUSA_COM_TEXTO: MotivoRecusa = 'outro';

export const rotuloMotivoRecusa = (key: string | null | undefined): string | null =>
  MOTIVOS_RECUSA.find((m) => m.key === key)?.label ?? null;
