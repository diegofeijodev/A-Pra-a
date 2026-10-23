/**
 * Regras puras da pesquisa automática de estabelecimentos (F2, contrato §22).
 *
 * Sem Prisma, HTTP nem relógio: provedores devolvem JSON cru, aqui ele vira
 * `LugarNormalizado`, é ordenado, deduplicado e comparado com os leads que já
 * existem. A distância e o "nome parecido" são os do bloco A (`campo-rules`):
 * a regra de 100 m é uma só.
 */
import { createHash } from 'node:crypto';
import { digits } from '../common/phone/phone';
import { distanciaM, nomeParecido, RAIO_DUPLICADO_M, type Coordenada } from './campo-rules';
import { norm } from './dedup';

export const TIPOS_LUGAR = ['bar', 'restaurante', 'lanchonete', 'padaria', 'cafe'] as const;
export type TipoLugar = (typeof TIPOS_LUGAR)[number];

export const FONTES_LUGAR = ['osm', 'apify'] as const;
export type FonteLugar = (typeof FONTES_LUGAR)[number];

/** Teto de resultados por busca (UX §5.1): custo e lista não estouram. */
export const MAX_RESULTADOS = 300;
/**
 * Elementos pedidos ao Overpass. Ele devolve na ordem dos ids, não por distância:
 * o teto fica bem acima de `MAX_RESULTADOS` para o corte "300 mais próximos" ser sobre o conjunto
 * inteiro. Se bater no teto, a resposta é parcial (`onParcial`) e a tela avisa.
 */
export const MAX_ELEMENTOS_OVERPASS = 2000;
export const CACHE_DIAS = 7;
/** Estimativa conservadora (US$/1.000 lugares): a listagem do actor diz "a partir de 1,50"; add-ons encarecem. */
const APIFY_USD_POR_MIL = 7;

export const ROTULO_TIPO: Record<TipoLugar, string> = {
  bar: 'Bares',
  restaurante: 'Restaurantes',
  lanchonete: 'Lanchonetes',
  padaria: 'Padarias',
  cafe: 'Cafés',
};

export interface LugarNormalizado {
  name: string;
  /** Um dos 5 tipos de hoje; com os segmentos editáveis ligados (§36), o `slug` do segmento. */
  category: string;
  address: string;
  lat: number;
  lng: number;
  /** Só `point`: coordenada pontual da fonte. Nunca CEP nem município (bug "0 km" do Freela). */
  location_precision: 'point';
  phone: string;
  website: string | null;
  source: FonteLugar;
  source_ref: string;
  closed: boolean;
  /** Lote D (§40.3): métricas do shopping achado (`{geometry_kind, area_m2, levels}`); ausente nos demais. */
  metrics?: Record<string, unknown>;
}

// ── Overpass ──────────────────────────────────────────────────

const FILTRO_OSM: Record<TipoLugar, string> = {
  bar: '["amenity"~"^(bar|pub)$"]',
  restaurante: '["amenity"="restaurant"]',
  lanchonete: '["amenity"="fast_food"]',
  padaria: '["shop"="bakery"]',
  cafe: '["amenity"="cafe"]',
};

export function montarQueryOverpass(centro: Coordenada, raioM: number, tipos: readonly TipoLugar[]): string {
  const raio = Math.trunc(raioM);
  const lat = Number(centro.lat);
  const lng = Number(centro.lng);
  if (![raio, lat, lng].every(Number.isFinite)) throw new Error('Centro ou raio inválido para a consulta.');
  const filtros = tipos.map((t) => `  nwr${FILTRO_OSM[t]}(around:${raio},${lat},${lng});`).join('\n');
  return `[out:json][timeout:25];\n(\n${filtros}\n);\nout tags center ${MAX_ELEMENTOS_OVERPASS};`;
}

type Tags = Record<string, string | undefined>;

const CATEGORIA_OSM: Record<string, TipoLugar> = {
  bar: 'bar',
  pub: 'bar',
  restaurant: 'restaurante',
  fast_food: 'lanchonete',
  cafe: 'cafe',
  bakery: 'padaria',
};

const primeiro = (v: string | undefined): string => (v ?? '').split(';')[0]!.trim();

export function enderecoOsm(t: Tags): string {
  const rua = [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(', ');
  const bairro = t['addr:suburb'] ?? t['addr:neighbourhood'];
  return [rua, bairro].filter(Boolean).join(' - ');
}

export const temMarcaDeFechado = (t: Tags): boolean =>
  Object.keys(t).some((k) => k.startsWith('disused:') || k.startsWith('abandoned:')) || t['opening_hours'] === 'off';

interface ElementoOverpass {
  type?: string;
  id?: number;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Tags;
}

/** Categoria de hoje (§22.1): `amenity`, senão `shop`. */
const categoriaOsm = (t: Tags): string | undefined => CATEGORIA_OSM[t['amenity'] ?? ''] ?? CATEGORIA_OSM[t['shop'] ?? ''];

/**
 * Resposta do Overpass → lugares. `classificar` decide a categoria (ausente = a regra de hoje); `null`/`undefined` = ignora o
 * elemento. Os segmentos editáveis (§36) passam o classificador deles.
 */
export function normalizarOverpass(
  resposta: unknown,
  classificar: (tags: Record<string, string | undefined>) => string | null | undefined = categoriaOsm,
): LugarNormalizado[] {
  const elementos = (resposta as { elements?: unknown } | null)?.elements;
  if (!Array.isArray(elementos)) return [];
  const saida: LugarNormalizado[] = [];
  for (const e of elementos as ElementoOverpass[]) {
    const lat = e.lat ?? e.center?.lat;
    const lng = e.lon ?? e.center?.lon;
    if (!e.type || e.id === undefined || typeof lat !== 'number' || typeof lng !== 'number') continue;
    const t = e.tags ?? {};
    const categoria = classificar(t);
    if (!categoria) continue;
    saida.push({
      name: (t['name'] ?? '').trim(),
      category: categoria,
      address: enderecoOsm(t),
      lat,
      lng,
      location_precision: 'point',
      phone: primeiro(t['phone'] ?? t['contact:phone'] ?? t['mobile'] ?? t['contact:mobile']),
      website: (t['website'] ?? t['contact:website'] ?? '').trim() || null,
      source: 'osm',
      source_ref: `${e.type}/${e.id}`,
      closed: temMarcaDeFechado(t),
    });
  }
  return saida;
}

// ── Apify (actor compass/crawler-google-places) ──────────────

interface ItemApify {
  title?: string;
  address?: string;
  phone?: string;
  website?: string | null;
  location?: { lat?: number; lng?: number };
  placeId?: string;
  categoryName?: string;
  permanentlyClosed?: boolean;
  temporarilyClosed?: boolean;
}

export function categoriaApify(nome: string | undefined): TipoLugar {
  const n = norm(nome);
  if (n.includes('padaria') || n.includes('confeitaria')) return 'padaria';
  if (n.includes('lanchonete') || n.includes('fastfood') || n.includes('hamburguer')) return 'lanchonete';
  if (n.includes('cafe')) return 'cafe';
  if (/\b(bar|pub|boteco)\b/.test((nome ?? '').normalize('NFD').toLowerCase())) return 'bar';
  return 'restaurante';
}

/** `classificar` = a categoria a partir da categoria do Google (ausente = a regra de hoje; os segmentos do §36 passam a deles). */
export function normalizarApify(itens: unknown, classificar: (categoryName: string | undefined) => string = categoriaApify): LugarNormalizado[] {
  if (!Array.isArray(itens)) return [];
  const saida: LugarNormalizado[] = [];
  for (const i of itens as ItemApify[]) {
    const lat = i.location?.lat;
    const lng = i.location?.lng;
    if (typeof lat !== 'number' || typeof lng !== 'number' || !i.placeId) continue;
    saida.push({
      name: (i.title ?? '').trim(),
      category: classificar(i.categoryName),
      address: (i.address ?? '').trim(),
      lat,
      lng,
      location_precision: 'point',
      phone: (i.phone ?? '').trim(),
      website: (i.website ?? '').trim() || null,
      source: 'apify',
      source_ref: i.placeId,
      closed: Boolean(i.permanentlyClosed || i.temporarilyClosed),
    });
  }
  return saida;
}

// ── Classificação dos achados da própria busca ───────────────

export type StatusAchado = 'novo' | 'duplicado' | 'descartado';
export type MotivoAchado = 'ja_na_praca' | 'repetido_na_busca' | 'parece_fechado' | 'sem_nome';

export interface Achado {
  lugar: LugarNormalizado;
  distance_m: number;
  status: StatusAchado;
  reason: MotivoAchado | null;
}

/**
 * Dentro do círculo, ordenado por distância ao centro, cortado em
 * `MAX_RESULTADOS` (os mais próximos), depois: fechado e sem nome →
 * descartado; repetido (mesmo `source_ref`, ou nome parecido a ≤ 100 m de um
 * já aceito) → duplicado. O primeiro por distância é o que fica.
 */
export function classificarAchados(
  lugares: LugarNormalizado[],
  centro: Coordenada,
  raioM: number,
): { achados: Achado[]; truncated: boolean } {
  const dentro = lugares
    .map((lugar) => ({ lugar, distance_m: distanciaM(centro, lugar) }))
    .filter((a) => a.distance_m <= raioM)
    .sort((a, b) => a.distance_m - b.distance_m);
  const truncated = dentro.length > MAX_RESULTADOS;

  const aceitos: LugarNormalizado[] = [];
  const refs = new Set<string>();
  const achados: Achado[] = dentro.slice(0, MAX_RESULTADOS).map(({ lugar, distance_m }) => {
    const base = { lugar, distance_m };
    if (!lugar.name) return { ...base, status: 'descartado', reason: 'sem_nome' };
    if (lugar.closed) return { ...base, status: 'descartado', reason: 'parece_fechado' };
    const repetido =
      refs.has(`${lugar.source}:${lugar.source_ref}`) ||
      aceitos.some((o) => nomeParecido(o.name, lugar.name) && distanciaM(o, lugar) <= RAIO_DUPLICADO_M);
    if (repetido) return { ...base, status: 'duplicado', reason: 'repetido_na_busca' };
    aceitos.push(lugar);
    refs.add(`${lugar.source}:${lugar.source_ref}`);
    return { ...base, status: 'novo', reason: null };
  });
  return { achados, truncated };
}

// ── Duplicidade contra leads existentes ──────────────────────

export interface LeadParaDedup {
  id: string;
  name: string;
  address: string;
  phone: string;
  lat: number | null;
  lng: number | null;
  source: string | null;
  source_ref: string | null;
}

export type PorQueDuplicou = 'source_ref' | 'telefone' | 'nome+endereço' | 'nome+proximidade';

/** Primeiro lead que já representa este lugar, na ordem: mesma fonte, telefone, nome+endereço, nome parecido ≤ 100 m. */
export function acharLeadDuplicado(
  lugar: LugarNormalizado,
  leads: LeadParaDedup[],
): { lead: LeadParaDedup; por: PorQueDuplicou } | null {
  const ref = leads.find((l) => l.source === lugar.source && l.source_ref === lugar.source_ref);
  if (ref) return { lead: ref, por: 'source_ref' };

  const tel = digits(lugar.phone).slice(-9);
  if (tel.length >= 8) {
    const hit = leads.find((l) => digits(l.phone).slice(-9) === tel);
    if (hit) return { lead: hit, por: 'telefone' };
  }

  const nome = norm(lugar.name);
  const end = norm(lugar.address);
  if (nome && end) {
    const hit = leads.find((l) => norm(l.name) === nome && norm(l.address) === end);
    if (hit) return { lead: hit, por: 'nome+endereço' };
  }

  const perto = leads.find(
    (l) =>
      l.lat !== null &&
      l.lng !== null &&
      nomeParecido(l.name, lugar.name) &&
      distanciaM({ lat: l.lat, lng: l.lng }, lugar) <= RAIO_DUPLICADO_M,
  );
  return perto ? { lead: perto, por: 'nome+proximidade' } : null;
}

// ── Cache de 7 dias ──────────────────────────────────────────

export function chaveCache(p: {
  lat: number;
  lng: number;
  radius_m: number;
  types: readonly string[];
  source: string;
  /** Hash da foto dos segmentos (§36.6): só com a flag ligada; ausente = a fórmula de hoje, byte a byte. */
  segmentos_hash?: string;
  /** Lote D (§40.3): `shoppings` | `lojas` (+ o shopping); ausente ou `lugares` = a fórmula de hoje. */
  kind?: string;
  parent_lead_id?: string | null;
}): string {
  const base = [p.source, p.lat, p.lng, p.radius_m, [...p.types].sort()];
  const comFoto = p.segmentos_hash === undefined ? base : [...base, p.segmentos_hash];
  const comKind = p.kind === undefined || p.kind === 'lugares' ? comFoto : [...comFoto, p.kind, p.parent_lead_id ?? null];
  const canonico = JSON.stringify(comKind);
  return createHash('sha256').update(canonico).digest('hex').slice(0, 40);
}

export function cacheValido(finishedAt: Date | null, agora: Date): boolean {
  if (!finishedAt) return false;
  return agora.getTime() - finishedAt.getTime() < CACHE_DIAS * 24 * 60 * 60_000;
}

export const fimDoCache = (finishedAt: Date): Date => new Date(finishedAt.getTime() + CACHE_DIAS * 24 * 60 * 60_000);

// ── Teto do Apify ────────────────────────────────────────────

export function limiteApify(p: { porBusca: number; tetoMensal: number; usadoNoMes: number }): number {
  return Math.max(0, Math.min(p.porBusca, p.tetoMensal - p.usadoNoMes));
}

export function estimarCustoApifyUsd(lugares: number): number {
  return Math.round(lugares * APIFY_USD_POR_MIL) / 1000;
}

/** `YYYY-MM` de Brasília (UTC−3, sem horário de verão desde 2019). */
export function mesDeBrasilia(agora: Date): string {
  return new Date(agora.getTime() - 3 * 60 * 60_000).toISOString().slice(0, 7);
}
