/**
 * Render de modelo de mensagem — porta literal de
 * `.prototype/src/lib/praca/mensagens.ts:42-100`.
 *
 * Diferença de propósito em relação ao protótipo: lá `link_video_caso`,
 * `link_cadastro`, `funcao`, `valor`, `dia_forte` e `turno` estavam cravados
 * no código do render. Aqui eles vêm de `ctx.defaults`
 * (`app_settings.template_defaults`, ver §12 do contrato), porque o time troca
 * esses valores por praça sem mexer no código.
 *
 * Regra que não muda: variável sem valor **não some** — fica visível como
 * `⟨variavel⟩` no texto renderizado. É o que faz o operador ver na hora que
 * mandou uma mensagem com buraco, em vez de mandar "Oi , tudo bem?".
 */
import { OPTOUT_WORDS, type TemplateDefaults } from './catalog/messages';
import { todaySp } from '../common/time/dates';

export type { TemplateDefaults };

/** O recorte do lead que o render enxerga — não precisa do `LeadView` inteiro. */
export interface RenderLead {
  name: string;
  decisor: string;
  city: string;
  address: string;
  vagas?: { date: string }[];
}

export interface RenderPraca {
  name: string;
  start_date: string;
}

export interface RenderMe {
  name: string;
}

export interface RenderCtx {
  lead?: RenderLead | undefined;
  praca?: RenderPraca | undefined;
  me?: RenderMe | undefined;
  /** Nome de outro estabelecimento da mesma cidade — a prova social do texto. */
  neighbor?: string | undefined;
  defaults: TemplateDefaults;
  extras?: Record<string, string> | undefined;
}

/** Primeiro nome de "Marcos Vieira" → "Marcos". */
export const firstName = (s: string): string => (s || '').trim().split(/\s+/)[0] ?? '';

const VAR_RE = /\{\{\s*([\w_]+)\s*\}\}/g;

/** Valor de cada variável para este contexto. `extras` vence todo o resto. */
function valueMap(ctx: RenderCtx): Record<string, string> {
  const l = ctx.lead;
  const d = ctx.defaults;
  return {
    nome: l?.decisor || l?.name || '',
    estabelecimento: l?.name ?? '',
    cidade: l?.city ?? '',
    praca: ctx.praca?.name ?? '',
    primeiro_nome_dono: firstName(l?.decisor ?? ''),
    link_video_caso: d.link_video_caso,
    link_cadastro: d.link_cadastro,
    funcao: d.funcao,
    data_vaga: l?.vagas?.[0]?.date ?? todaySp(),
    valor: d.valor,
    meu_nome: firstName(ctx.me?.name ?? ''),
    estabelecimento_vizinho: ctx.neighbor ?? '',
    dia_forte: d.dia_forte,
    data: ctx.praca?.start_date ?? todaySp(),
    turno: d.turno,
    // Bairro: último pedaço do endereço ("Rua X, 120, Savassi" → "Savassi").
    bairro: (l?.address ?? '').split(',').slice(-1)[0]?.trim() ?? '',
    ...(ctx.extras ?? {}),
  };
}

/** Substitui `{{variavel}}` pelos dados do contexto; o que não achar fica `⟨variavel⟩`. */
export function renderTemplate(text: string, ctx: RenderCtx): string {
  const map = valueMap(ctx);
  return (text || '').replace(VAR_RE, (_m, key: string) => {
    const v = map[key];
    return v && v.trim() ? v : `⟨${key}⟩`;
  });
}

/** Variáveis usadas no texto, sem repetir, na ordem em que aparecem. */
export const usedVariables = (text: string): string[] => [
  ...new Set([...(text || '').matchAll(VAR_RE)].map((m) => m[1]!)),
];

/** Das variáveis usadas, as que ficariam `⟨assim⟩` — inclui as desconhecidas. */
export function missingVariables(text: string, ctx: RenderCtx): string[] {
  const map = valueMap(ctx);
  return usedVariables(text).filter((v) => !(map[v] ?? '').trim());
}

/**
 * Resposta que pede para parar de receber mensagem. Igual ao protótipo:
 * casa a palavra inteira OU contida no texto — "me remove por favor" sai.
 */
export function isOptOut(text: string): boolean {
  const t = (text || '').toLowerCase().trim();
  if (!t) return false;
  return OPTOUT_WORDS.some((w) => t === w || t.includes(w));
}
