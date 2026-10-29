/**
 * Segmentos editáveis da busca de estabelecimentos (restante da Lovable, fase L5; contrato §36). Puro.
 *
 * Um segmento é um conjunto de filtros do mapa aberto (OU de E) mais palavras no nome. A consulta do Overpass é montada
 * AQUI, a partir de termos validados por lista branca (letras, dígitos, `_` e espaço): nunca se aceita QL vindo do cliente.
 * Os 5 tipos de hoje (§22.1) têm filtros idênticos aos de `places-rules`: a consulta deles sai byte a byte igual.
 */
import { createHash } from 'node:crypto';
import type { Coordenada } from './campo-rules';
import { norm } from './dedup';
import {
  categoriaApify,
  MAX_ELEMENTOS_OVERPASS,
  normalizarApify,
  normalizarOverpass,
  type LugarNormalizado,
} from './places-rules';

export const OPS_FILTRO = ['=', '~'] as const;
export type OpFiltro = (typeof OPS_FILTRO)[number];

/** Chaves "de base" do OSM: de valor único (o `~` fica ancorado como hoje) e as que as palavras no nome exigem. */
export const CHAVES_BASE = ['amenity', 'shop', 'craft', 'tourism'] as const;
const ehBase = (k: string) => (CHAVES_BASE as readonly string[]).includes(k);

export interface FiltroSegmento {
  key: string;
  op: OpFiltro;
  value: string;
}

export interface Segmento {
  slug: string;
  label: string;
  /** OU entre os grupos; E dentro de cada grupo. */
  filters: FiltroSegmento[][];
  keywords: string[];
  /** Menor = primeiro na classificação. */
  priority: number;
  active: boolean;
  apify_term?: string | null;
}

export const LIMITES_SEGMENTOS = {
  lista: 40,
  grupos: 6,
  filtrosPorGrupo: 4,
  termos: 10,
  palavras: 10,
  porBusca: 10,
} as const;

const f = (key: string, op: OpFiltro, value: string): FiltroSegmento => ({ key, op, value });

/** Os 10 padrão (§36.5): os 8 da Lovable traduzidos para o mapa aberto + Lanchonete e Café (nossos). */
export const SEGMENTOS_PADRAO: readonly Segmento[] = Object.freeze([
  {
    slug: 'buffet',
    label: 'Buffet',
    priority: 10,
    active: true,
    apify_term: 'buffet',
    keywords: ['buffet'],
    filters: [[f('craft', '=', 'caterer')], [f('amenity', '=', 'restaurant'), f('cuisine', '~', 'buffet')]],
  },
  {
    slug: 'pizzaria',
    label: 'Pizzaria',
    priority: 20,
    active: true,
    apify_term: 'pizzaria',
    keywords: [],
    filters: [[f('amenity', '~', 'restaurant|fast_food'), f('cuisine', '~', 'pizza')]],
  },
  {
    slug: 'hamburgueria',
    label: 'Hamburgueria',
    priority: 30,
    active: true,
    apify_term: 'hamburgueria',
    keywords: [],
    filters: [[f('amenity', '~', 'restaurant|fast_food'), f('cuisine', '~', 'burger')]],
  },
  {
    slug: 'hotel',
    label: 'Hotel',
    priority: 40,
    active: true,
    apify_term: 'hotel',
    keywords: [],
    filters: [[f('tourism', '=', 'hotel')]],
  },
  {
    slug: 'motel',
    label: 'Motel',
    priority: 50,
    active: true,
    apify_term: 'motel',
    keywords: [],
    filters: [[f('tourism', '=', 'motel')]],
  },
  // Os 5 de hoje: filtros e termos do Apify IGUAIS aos de `places-rules`/`apify.provider` (estão gravados em types/category/cache_key).
  {
    slug: 'bar',
    label: 'Bar',
    priority: 60,
    active: true,
    apify_term: 'bar',
    keywords: [],
    filters: [[f('amenity', '~', 'bar|pub')]],
  },
  {
    slug: 'restaurante',
    label: 'Restaurante',
    priority: 70,
    active: true,
    apify_term: 'restaurante',
    keywords: [],
    filters: [[f('amenity', '=', 'restaurant')]],
  },
  {
    slug: 'lanchonete',
    label: 'Lanchonete',
    priority: 80,
    active: true,
    apify_term: 'lanchonete',
    keywords: [],
    filters: [[f('amenity', '=', 'fast_food')]],
  },
  {
    slug: 'cafe',
    label: 'Café',
    priority: 90,
    active: true,
    apify_term: 'cafeteria',
    keywords: [],
    filters: [[f('amenity', '=', 'cafe')]],
  },
  {
    slug: 'padaria',
    label: 'Padaria',
    priority: 100,
    active: true,
    apify_term: 'padaria',
    keywords: [],
    filters: [[f('shop', '=', 'bakery')]],
  },
] satisfies Segmento[]) as readonly Segmento[];

// ── validação ────────────────────────────────────────────────

const RE_SLUG = /^[a-z0-9_]{2,30}$/;
const RE_CHAVE = /^[a-z_:]{1,40}$/;
/** Termo de filtro: letras (com acento), dígitos, `_` e espaço. Nada de aspas, barras, colchetes, parênteses ou ponto. */
const RE_TERMO = /^[\p{L}\p{N}_ ]{1,40}$/u;
const RE_PALAVRA = /^[\p{L}\p{N} ]{2,40}$/u;

export type ResultadoSegmentos = { ok: true; segmentos: Segmento[] } | { ok: false; erro: string };

const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const texto = (v: unknown): string | null => (typeof v === 'string' ? v.trim() : null);

function validarFiltro(
  raw: unknown,
  campo: string,
): { ok: true; f: FiltroSegmento } | { ok: false; erro: string } {
  if (!obj(raw)) return { ok: false, erro: `${campo}: filtro inválido.` };
  const key = texto(raw.key);
  if (!key || !RE_CHAVE.test(key))
    return { ok: false, erro: `${campo}.key: use só letras minúsculas, "_" e ":" (até 40).` };
  if (raw.op !== '=' && raw.op !== '~') return { ok: false, erro: `${campo}.op: use "=" ou "~".` };
  const bruto = texto(raw.value);
  if (bruto === null) return { ok: false, erro: `${campo}.value: obrigatório.` };
  const termos = bruto.split('|').map((x) => x.trim());
  if (raw.op === '=' && termos.length !== 1)
    return { ok: false, erro: `${campo}.value: com "=" vai um termo só.` };
  if (termos.length > LIMITES_SEGMENTOS.termos)
    return { ok: false, erro: `${campo}.value: no máximo ${LIMITES_SEGMENTOS.termos} termos.` };
  if (!termos.every((x) => RE_TERMO.test(x))) {
    return {
      ok: false,
      erro: `${campo}.value: use só letras, números, "_" e espaço (separe os termos com "|").`,
    };
  }
  return { ok: true, f: { key, op: raw.op, value: termos.join('|') } };
}

function validarSegmento(
  raw: unknown,
  campo: string,
): { ok: true; s: Segmento } | { ok: false; erro: string } {
  if (!obj(raw)) return { ok: false, erro: `${campo}: segmento inválido.` };
  const slug = texto(raw.slug);
  if (!slug || !RE_SLUG.test(slug))
    return { ok: false, erro: `${campo}.slug: de 2 a 30 letras minúsculas, números ou "_".` };
  const label = texto(raw.label);
  if (!label || label.length > 40) return { ok: false, erro: `${campo}.label: de 1 a 40 caracteres.` };
  if (
    !Array.isArray(raw.filters) ||
    raw.filters.length < 1 ||
    raw.filters.length > LIMITES_SEGMENTOS.grupos
  ) {
    return { ok: false, erro: `${campo}.filters: de 1 a ${LIMITES_SEGMENTOS.grupos} grupos.` };
  }
  const filters: FiltroSegmento[][] = [];
  for (const [gi, g] of (raw.filters as unknown[]).entries()) {
    if (!Array.isArray(g) || g.length < 1 || g.length > LIMITES_SEGMENTOS.filtrosPorGrupo) {
      return {
        ok: false,
        erro: `${campo}.filters[${gi}]: de 1 a ${LIMITES_SEGMENTOS.filtrosPorGrupo} filtros por grupo.`,
      };
    }
    const grupo: FiltroSegmento[] = [];
    for (const [fi, rf] of g.entries()) {
      const r = validarFiltro(rf, `${campo}.filters[${gi}][${fi}]`);
      if (!r.ok) return r;
      grupo.push(r.f);
    }
    filters.push(grupo);
  }
  const kwRaw = raw.keywords ?? [];
  if (!Array.isArray(kwRaw) || kwRaw.length > LIMITES_SEGMENTOS.palavras)
    return { ok: false, erro: `${campo}.keywords: no máximo ${LIMITES_SEGMENTOS.palavras}.` };
  const keywords: string[] = [];
  for (const [ki, k] of kwRaw.entries()) {
    const p = texto(k);
    if (!p || !RE_PALAVRA.test(p))
      return { ok: false, erro: `${campo}.keywords[${ki}]: de 2 a 40 letras, números ou espaço.` };
    keywords.push(p);
  }
  if (keywords.length > 0 && basesDoSegmento({ filters } as Segmento).length === 0) {
    return {
      ok: false,
      erro: `${campo}.keywords: palavras no nome exigem um filtro de base (${CHAVES_BASE.join(', ')}).`,
    };
  }
  const priority = raw.priority;
  if (!Number.isInteger(priority) || (priority as number) < 1 || (priority as number) > 999) {
    return { ok: false, erro: `${campo}.priority: inteiro de 1 a 999.` };
  }
  if (typeof raw.active !== 'boolean') return { ok: false, erro: `${campo}.active: verdadeiro ou falso.` };
  let apify_term: string | null = null;
  if (raw.apify_term !== undefined && raw.apify_term !== null) {
    const a = texto(raw.apify_term);
    if (!a || !RE_PALAVRA.test(a))
      return { ok: false, erro: `${campo}.apify_term: de 2 a 40 letras, números ou espaço.` };
    apify_term = a;
  }
  return {
    ok: true,
    s: { slug, label, filters, keywords, priority: priority as number, active: raw.active, apify_term },
  };
}

/**
 * Lista inteira (o PUT manda todas). `existentes` = slugs já gravados: nenhum some (só desativar). Erro com o campo, no
 * formato do `VALIDATION_ERROR`.
 */
export function validarSegmentos(lista: unknown, existentes: readonly string[] = []): ResultadoSegmentos {
  if (!Array.isArray(lista) || lista.length < 1 || lista.length > LIMITES_SEGMENTOS.lista) {
    return { ok: false, erro: `segments: de 1 a ${LIMITES_SEGMENTOS.lista} segmentos.` };
  }
  const segmentos: Segmento[] = [];
  for (const [i, raw] of lista.entries()) {
    const r = validarSegmento(raw, `segments[${i}]`);
    if (!r.ok) return r;
    if (segmentos.some((s) => s.slug === r.s.slug))
      return { ok: false, erro: `segments[${i}].slug: '${r.s.slug}' repetido.` };
    segmentos.push(r.s);
  }
  for (const slug of existentes) {
    if (!segmentos.some((s) => s.slug === slug))
      return { ok: false, erro: `segments: o segmento '${slug}' não pode ser apagado; desative-o.` };
  }
  if (!segmentos.some((s) => s.active))
    return { ok: false, erro: 'segments: deixe ao menos um segmento ativo.' };
  return { ok: true, segmentos };
}

/** O que está gravado em `app_settings.place_segments` → a lista (inválido ou ausente = padrão). */
export function lerSegmentos(raw: unknown): { segmentos: Segmento[]; is_default: boolean } {
  const lista = obj(raw) ? raw.segments : undefined;
  if (lista !== undefined) {
    const r = validarSegmentos(lista);
    if (r.ok) return { segmentos: r.segmentos, is_default: false };
  }
  return {
    segmentos: SEGMENTOS_PADRAO.map((s) => ({
      ...s,
      filters: s.filters.map((g) => g.map((x) => ({ ...x }))),
      keywords: [...s.keywords],
    })),
    is_default: true,
  };
}

// ── consulta ─────────────────────────────────────────────────

/** `(around:R,LAT,LNG)` — igual ao de hoje (raio truncado). A busca dentro de um shopping (§40, L8) troca só este seletor. */
export function seletorRaio(centro: Coordenada, raioM: number): string {
  const raio = Math.trunc(raioM);
  const lat = Number(centro.lat);
  const lng = Number(centro.lng);
  if (![raio, lat, lng].every(Number.isFinite)) throw new Error('Centro ou raio inválido para a consulta.');
  return `(around:${raio},${lat},${lng})`;
}

const basesDoSegmento = (s: Pick<Segmento, 'filters'>): string[] => [
  ...new Set(
    s.filters
      .flat()
      .map((x) => x.key)
      .filter(ehBase),
  ),
];

function renderFiltro(x: FiltroSegmento): string {
  if (x.op === '=') return `["${x.key}"="${x.value}"]`;
  // Chave de base: valor único, ancorado (o `bar` de hoje). Outra chave (ex.: cuisine): o OSM guarda lista com ";".
  return ehBase(x.key) ? `["${x.key}"~"^(${x.value})$"]` : `["${x.key}"~"(^|;) *(${x.value}) *(;|$)"]`;
}

const conjuntoDaBase = (b: string) => `kb_${b}`;

/** As palavras no nome filtram o conjunto da base (`conjuntosDasPalavras`), nunca o índice de nomes inteiro. */
export function linhasDoSegmento(s: Segmento, seletor: string): string[] {
  const linhas = s.filters.map((g) => `  nwr${g.map(renderFiltro).join('')}${seletor};`);
  if (s.keywords.length > 0) {
    for (const b of basesDoSegmento(s)) linhas.push(`  nwr.${conjuntoDaBase(b)}["name"~"${s.keywords.join('|')}",i];`);
  }
  return linhas;
}

/**
 * Antes da união: cada chave de base que as palavras usam, já recortada pelo seletor. Um `name~` direto faz o Overpass varrer
 * os nomes do mundo inteiro antes do raio e estourar o `[timeout:25]` (Jundiaí, 27 e 29/10, com o Buffet). Sem palavras, nada.
 */
export function conjuntosDasPalavras(segmentos: readonly Segmento[], seletor: string): string {
  const bases = new Set(segmentos.filter((s) => s.keywords.length > 0).flatMap(basesDoSegmento));
  return [...bases].map((b) => `nwr["${b}"]${seletor}->.${conjuntoDaBase(b)};\n`).join('');
}

export function montarQuerySegmentos(segmentos: readonly Segmento[], seletor: string): string {
  const linhas = segmentos.flatMap((s) => linhasDoSegmento(s, seletor));
  return `[out:json][timeout:25];\n${conjuntosDasPalavras(segmentos, seletor)}(\n${linhas.join('\n')}\n);\nout tags center ${MAX_ELEMENTOS_OVERPASS};`;
}

// ── classificação ────────────────────────────────────────────

type Tags = Record<string, string | undefined>;

function casaFiltro(t: Tags, x: FiltroSegmento): boolean {
  const v = t[x.key];
  if (v === undefined) return false;
  if (x.op === '=') return v === x.value;
  const termos = x.value.split('|');
  return ehBase(x.key) ? termos.includes(v) : v.split(';').some((item) => termos.includes(item.trim()));
}

const porPrioridade = (segs: readonly Segmento[]): Segmento[] =>
  segs
    .map((s, i) => ({ s, i }))
    .sort((a, b) => a.s.priority - b.s.priority || a.i - b.i)
    .map((x) => x.s);

/** O primeiro segmento (por prioridade, empate = ordem da lista) que casa as etiquetas; `null` se nenhum. */
export function classificarSegmento(tags: Tags, segmentos: readonly Segmento[]): string | null {
  const nome = norm(tags['name']);
  for (const s of porPrioridade(segmentos)) {
    if (s.filters.some((g) => g.every((x) => casaFiltro(tags, x)))) return s.slug;
    if (
      nome &&
      s.keywords.some((k) => nome.includes(norm(k))) &&
      basesDoSegmento(s).some((b) => tags[b] !== undefined)
    )
      return s.slug;
  }
  return null;
}

/** Overpass → lugares com a categoria = slug do segmento da busca. */
export function normalizarOverpassSegmentos(
  resposta: unknown,
  segmentos: readonly Segmento[],
): LugarNormalizado[] {
  return normalizarOverpass(resposta, (t) => classificarSegmento(t, segmentos));
}

/** Apify: o primeiro segmento cujo termo/rótulo aparece na categoria do Google; senão a regra de hoje, se pedida; senão o 1º pedido. */
export function categoriaApifySegmentos(
  categoryName: string | undefined,
  segmentos: readonly Segmento[],
): string {
  const cat = norm(categoryName);
  const ordenados = porPrioridade(segmentos);
  const achou = ordenados.find((s) => [s.apify_term ?? '', s.label].some((t) => t && cat.includes(norm(t))));
  if (achou) return achou.slug;
  const deHoje = categoriaApify(categoryName);
  if (ordenados.some((s) => s.slug === deHoje)) return deHoje;
  return ordenados[0]?.slug ?? deHoje;
}

export function normalizarApifySegmentos(itens: unknown, segmentos: readonly Segmento[]): LugarNormalizado[] {
  return normalizarApify(itens, (c) => categoriaApifySegmentos(c, segmentos));
}

/** Termos do actor do Google para os segmentos pedidos (`apify_term`, senão o rótulo). */
export const termosApify = (segmentos: readonly Segmento[]): string[] =>
  segmentos.map((s) => s.apify_term || s.label);

// ── foto e cache ─────────────────────────────────────────────

/**
 * Os segmentos pedidos, **na ordem dos slugs** (o serviço manda `types` ordenado, como hoje: a consulta dos 5 de hoje sai
 * byte a byte igual; a prioridade só vale na classificação). É a foto gravada na busca. Slug desconhecido fica de fora.
 */
export function segmentosDaBusca(todos: readonly Segmento[], slugs: readonly string[]): Segmento[] {
  return slugs.map((slug) => todos.find((s) => s.slug === slug)).filter((s): s is Segmento => !!s);
}

/** Hash canônico da foto (ordem dos slugs não importa): entra na chave do cache só com a flag ligada. */
export function hashSegmentos(segmentos: readonly Segmento[]): string {
  const canonico = [...segmentos]
    .sort((a, b) => a.slug.localeCompare(b.slug))
    .map((s) => [
      s.slug,
      s.priority,
      s.filters.map((g) => g.map((x) => [x.key, x.op, x.value])),
      s.keywords,
      s.apify_term ?? null,
    ]);
  return createHash('sha256').update(JSON.stringify(canonico)).digest('hex').slice(0, 16);
}

/** Lê a foto gravada na busca (`segments_snapshot`); inválida = `null` (a busca roda com os tipos fixos de hoje). */
export function lerFotoSegmentos(raw: unknown): Segmento[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const r = validarSegmentos(raw.map((s) => (obj(s) ? { ...s, active: true } : s)));
  return r.ok ? r.segmentos : null;
}
