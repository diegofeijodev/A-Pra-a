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

/**
 * Modo do chefe §31.5: a Lovable tem "Sem demanda" (`MOTIVOS_NAO` em `src/lib/visita.ts`) e o catálogo não tinha.
 * Só se ACRESCENTA, e só na lista do fluxo simples: o questionário completo segue com as 6 de antes (nada muda em prod).
 */
export const MOTIVOS_RECUSA_SIMPLES = [...MOTIVOS_RECUSA, { key: 'sem_demanda', label: 'Sem demanda' }] as const;

export type MotivoRecusa = (typeof MOTIVOS_RECUSA_SIMPLES)[number]['key'];

/** O servidor aceita qualquer das 7 em qualquer fluxo; quem decide o que mostrar é a tela. */
export const CHAVES_MOTIVO_RECUSA: readonly string[] = MOTIVOS_RECUSA_SIMPLES.map((m) => m.key);

/** Motivo que aceita texto livre curto. */
export const MOTIVO_RECUSA_COM_TEXTO: MotivoRecusa = 'outro';

export const rotuloMotivoRecusa = (key: string | null | undefined): string | null =>
  MOTIVOS_RECUSA_SIMPLES.find((m) => m.key === key)?.label ?? null;
