/**
 * Shoppings pelo mapa aberto (restante da Lovable, fase L8; contrato §40). Puro: sem Prisma, HTTP nem relógio.
 *
 * - O "tamanho" de um shopping sai da ÁREA do polígono `shop=mall` do OpenStreetMap (a Lovable usava ≥ 2.500 avaliações do
 *   Google, dado que não temos). Área = shoelace numa projeção equirretangular local (erro desprezível no tamanho de um shopping),
 *   anéis externos menos os internos. Shopping mapeado só como ponto não tem área (fica "menos confiável").
 * - O critério de "grande" é configurável (`field_config.shopping`) e a marcação à mão vale mais que ele.
 * - As consultas do Overpass são montadas AQUI (referência `way/<id>`/`relation/<id>` conferida por expressão), nunca com QL do
 *   cliente. As lojas de dentro reaproveitam as linhas dos segmentos (§36): só o seletor muda (`(area.shop)` ou o raio).
 */
import { distanciaM, type Coordenada } from './campo-rules';
import { norm } from './dedup';
import { grupoConfig, inteiroEntre, umDe, type GrupoConfig } from './config-grupo';
import { enderecoOsm, MAX_ELEMENTOS_OVERPASS, temMarcaDeFechado, type LugarNormalizado } from './places-rules';
import { linhasDoSegmento, seletorRaio, type Segmento } from './segmentos-rules';

const RAIO_TERRA_M = 6_371_000;
const rad = (g: number): number => (g * Math.PI) / 180;

// ── área ─────────────────────────────────────────────────────

/** Área de um anel (fechado ou não; o último ponto liga ao primeiro), em m². Menos de 3 pontos = 0. */
export function areaAnelM2(anel: readonly Coordenada[]): number {
  const pts = anel.length > 1 && iguais(anel[0]!, anel[anel.length - 1]!) ? anel.slice(0, -1) : [...anel];
  if (pts.length < 3) return 0;
  const lat0 = pts.reduce((s, p) => s + p.lat, 0) / pts.length;
  const k = Math.cos(rad(lat0));
  const xy = pts.map((p) => ({ x: RAIO_TERRA_M * rad(p.lng) * k, y: RAIO_TERRA_M * rad(p.lat) }));
  let soma = 0;
  for (let i = 0; i < xy.length; i += 1) {
    const a = xy[i]!;
    const b = xy[(i + 1) % xy.length]!;
    soma += a.x * b.y - b.x * a.y;
  }
  return Math.abs(soma) / 2;
}

export interface Poligono {
  externos: Coordenada[][];
  internos: Coordenada[][];
}

/** Soma dos externos menos a dos internos; nunca negativa. */
export function areaPoligonoM2(p: Poligono): number {
  const fora = p.externos.reduce((s, a) => s + areaAnelM2(a), 0);
  const furos = p.internos.reduce((s, a) => s + areaAnelM2(a), 0);
  return Math.max(0, fora - furos);
}

const iguais = (a: Coordenada, b: Coordenada) => a.lat === b.lat && a.lng === b.lng;
const fechado = (t: readonly Coordenada[]) => t.length >= 4 && iguais(t[0]!, t[t.length - 1]!);

/**
 * Junta trechos (ways de um multipolygon) em anéis fechados, ligando ponta com ponta (invertendo o trecho quando preciso).
 * O que não fecha fica de fora: sem anel completo não se inventa área.
 */
export function montarAneis(trechos: readonly (readonly Coordenada[])[]): Coordenada[][] {
  const aneis: Coordenada[][] = [];
  const soltos = trechos.filter((t) => t.length >= 2).map((t) => [...t]);
  for (let i = soltos.length - 1; i >= 0; i -= 1) {
    if (fechado(soltos[i]!)) aneis.push(soltos.splice(i, 1)[0]!);
  }
  aneis.reverse();
  while (soltos.length > 0) {
    let atual = soltos.shift()!;
    let cresceu = true;
    while (!fechado(atual) && cresceu) {
      cresceu = false;
      const fim = atual[atual.length - 1]!;
      for (let j = 0; j < soltos.length; j += 1) {
        const t = soltos[j]!;
        if (iguais(t[0]!, fim)) atual = [...atual, ...t.slice(1)];
        else if (iguais(t[t.length - 1]!, fim)) atual = [...atual, ...[...t].reverse().slice(1)];
        else continue;
        soltos.splice(j, 1);
        cresceu = true;
        break;
      }
    }
    if (fechado(atual)) aneis.push(atual);
  }
  return aneis;
}

// ── geometria do Overpass (`out geom`) ───────────────────────

interface PontoOsm {
  lat?: number;
  lon?: number;
}
export interface ElementoGeom {
  type?: string;
  id?: number;
  lat?: number;
  lon?: number;
  center?: PontoOsm;
  bounds?: { minlat?: number; minlon?: number; maxlat?: number; maxlon?: number };
  geometry?: (PontoOsm | null)[];
  members?: { type?: string; role?: string; geometry?: (PontoOsm | null)[] }[];
  tags?: Record<string, string | undefined>;
}

export type TipoGeometria = 'poligono' | 'ponto';
export interface GeometriaShopping {
  geometry_kind: TipoGeometria;
  area_m2: number | null;
  centro: Coordenada;
}

const pontos = (g: (PontoOsm | null)[] | undefined): Coordenada[] =>
  (g ?? []).filter((p): p is { lat: number; lon: number } => typeof p?.lat === 'number' && typeof p?.lon === 'number').map((p) => ({ lat: p.lat, lng: p.lon }));

/** Centro de área (centroide do anel) — sem anel, a média dos pontos. */
function centroide(anel: Coordenada[]): Coordenada {
  const pts = fechado(anel) ? anel.slice(0, -1) : anel;
  const lat0 = pts.reduce((s, p) => s + p.lat, 0) / pts.length;
  const k = Math.cos(rad(lat0));
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const p = pts[i]!;
    const q = pts[(i + 1) % pts.length]!;
    const x1 = p.lng * k;
    const x2 = q.lng * k;
    const cruz = x1 * q.lat - x2 * p.lat;
    a += cruz;
    cx += (x1 + x2) * cruz;
    cy += (p.lat + q.lat) * cruz;
  }
  if (Math.abs(a) < 1e-15) return { lat: lat0, lng: pts.reduce((s, p) => s + p.lng, 0) / pts.length };
  return { lat: cy / (3 * a), lng: cx / (3 * a) / k };
}

function centroDosLimites(e: ElementoGeom): Coordenada | null {
  const b = e.bounds;
  if (b && [b.minlat, b.minlon, b.maxlat, b.maxlon].every((v) => typeof v === 'number')) {
    return { lat: (b.minlat! + b.maxlat!) / 2, lng: (b.minlon! + b.maxlon!) / 2 };
  }
  if (typeof e.center?.lat === 'number' && typeof e.center?.lon === 'number') return { lat: e.center.lat, lng: e.center.lon };
  return null;
}

/** Polígono (área > 0) ou ponto; `null` = sem coordenada nenhuma. */
export function geometriaDoElemento(e: ElementoGeom): GeometriaShopping {
  const comoPonto = (c: Coordenada | null): GeometriaShopping =>
    ({ geometry_kind: 'ponto', area_m2: null, centro: c ?? { lat: NaN, lng: NaN } });
  if (e.type === 'node') {
    return comoPonto(typeof e.lat === 'number' && typeof e.lon === 'number' ? { lat: e.lat, lng: e.lon } : null);
  }
  let poligono: Poligono = { externos: [], internos: [] };
  if (e.type === 'way') {
    const anel = pontos(e.geometry);
    if (fechado(anel)) poligono = { externos: [anel], internos: [] };
  } else if (e.type === 'relation') {
    // Só membros `way` com geometria (há relations mal mapeadas com nós como "outer"/"inner"); papel vazio = externo.
    const ways = (e.members ?? []).filter((m) => m.type === 'way');
    const externos = montarAneis(ways.filter((m) => (m.role ?? '') !== 'inner').map((m) => pontos(m.geometry)));
    const internos = montarAneis(ways.filter((m) => m.role === 'inner').map((m) => pontos(m.geometry)));
    poligono = { externos, internos };
  }
  const area = areaPoligonoM2(poligono);
  if (poligono.externos.length === 0 || area <= 0) return comoPonto(centroDosLimites(e));
  // Centro: o do maior anel externo (cai dentro do shopping nos formatos comuns).
  const maior = [...poligono.externos].sort((a, b) => areaAnelM2(b) - areaAnelM2(a))[0]!;
  return { geometry_kind: 'poligono', area_m2: Math.round(area), centro: centroide(maior) };
}

// ── resposta → shoppings ─────────────────────────────────────

export interface MetricasShopping {
  geometry_kind: TipoGeometria;
  area_m2: number | null;
  /** Lojas mapeadas dentro (medido na busca de lojas); `null` = ainda não medido. */
  pois_mapped: number | null;
  /** `building:levels` do OSM, quando existe. */
  levels: number | null;
  large_override: boolean | null;
}

export interface ShoppingNormalizado {
  lugar: LugarNormalizado;
  metricas: Pick<MetricasShopping, 'geometry_kind' | 'area_m2' | 'levels'>;
}

const andares = (v: string | undefined): number | null => {
  const n = Number((v ?? '').trim());
  return Number.isInteger(n) && n > 0 && n < 200 ? n : null;
};

/** Mesmo shopping mapeado duas vezes (way + relation, ou ponto + polígono): fica o de maior área, polígono antes de ponto. */
const RAIO_MESMO_SHOPPING_M = 300;

export function normalizarShoppings(resposta: unknown): ShoppingNormalizado[] {
  const elementos = (resposta as { elements?: unknown } | null)?.elements;
  if (!Array.isArray(elementos)) return [];
  const todos: ShoppingNormalizado[] = [];
  for (const e of elementos as ElementoGeom[]) {
    const t = e.tags ?? {};
    if (t['shop'] !== 'mall' || !e.type || e.id === undefined) continue;
    const g = geometriaDoElemento(e);
    if (!Number.isFinite(g.centro.lat) || !Number.isFinite(g.centro.lng)) continue;
    todos.push({
      lugar: {
        name: (t['name'] ?? '').trim(),
        category: 'shopping',
        address: enderecoOsm(t),
        lat: g.centro.lat,
        lng: g.centro.lng,
        location_precision: 'point',
        phone: '',
        website: null,
        source: 'osm',
        source_ref: `${e.type}/${e.id}`,
        closed: temMarcaDeFechado(t),
      },
      metricas: { geometry_kind: g.geometry_kind, area_m2: g.area_m2, levels: andares(t['building:levels']) },
    });
  }
  const peso = (s: ShoppingNormalizado) => (s.metricas.geometry_kind === 'poligono' ? 1 : 0) * 1e12 + (s.metricas.area_m2 ?? 0);
  const ordenados = [...todos].sort((a, b) => peso(b) - peso(a) || (a.lugar.source_ref < b.lugar.source_ref ? -1 : 1));
  const ficam: ShoppingNormalizado[] = [];
  for (const s of ordenados) {
    // Nome IGUAL (sem acento e maiúsculas), não "parecido": "Minas Shopping" e "Conviva Minas Shopping" são dois prédios (dry-run BH).
    const repetido =
      s.lugar.name !== '' &&
      ficam.some((o) => norm(o.lugar.name) === norm(s.lugar.name) && distanciaM(o.lugar, s.lugar) <= RAIO_MESMO_SHOPPING_M);
    if (!repetido) ficam.push(s);
  }
  // Ordem de chegada da resposta (a busca reordena por distância depois).
  return todos.filter((s) => ficam.includes(s));
}

// ── critério de "grande" ─────────────────────────────────────

export const CRITERIOS_SHOPPING = ['area', 'lojas', 'area_ou_lojas', 'area_e_lojas', 'todos'] as const;
export type CriterioShopping = (typeof CRITERIOS_SHOPPING)[number];

export interface ConfigShopping {
  criterio: CriterioShopping;
  area_min_m2: number;
  lojas_min: number;
  raio_lojas_m: number;
  fora_da_rota_geral: boolean;
}

/**
 * Padrão (decisão do orquestrador, 21/10): área ≥ 20.000 m²; "≥ N lojas" (UX: 50) como critério alternativo; raio das lojas
 * 300 m (Lovable); shoppings e lojas de dentro fora da rota geral (Lovable).
 */
export const CONFIG_SHOPPING: GrupoConfig<ConfigShopping> = grupoConfig<ConfigShopping>(
  { criterio: 'area', area_min_m2: 20_000, lojas_min: 50, raio_lojas_m: 300, fora_da_rota_geral: true },
  {
    criterio: umDe(CRITERIOS_SHOPPING),
    area_min_m2: inteiroEntre(1_000, 1_000_000),
    lojas_min: inteiroEntre(1, 1_000),
    raio_lojas_m: inteiroEntre(50, 2_000),
    fora_da_rota_geral: (v) => typeof v === 'boolean',
  },
);

const n = (x: number) => Math.round(x).toLocaleString('pt-BR');

export interface DecisaoGrande {
  grande: boolean;
  /** `manual` = marcado à mão (vale mais que o critério). */
  por: 'manual' | 'criterio';
  conta: string;
}

/** Grande ou não, com a conta escrita (regra "todo número diz o que é e a conta"). */
export function ehGrande(m: MetricasShopping, cfg: ConfigShopping): DecisaoGrande {
  if (m.large_override !== null) {
    return {
      grande: m.large_override,
      por: 'manual',
      conta: `Marcado à mão como ${m.large_override ? 'grande' : 'não grande'} (vale mais que o critério).`,
    };
  }
  const porArea = m.area_m2 !== null && m.area_m2 >= cfg.area_min_m2;
  const porLojas = m.pois_mapped !== null && m.pois_mapped >= cfg.lojas_min;
  const txtArea =
    m.area_m2 === null
      ? 'Sem área: o shopping está só como um ponto no mapa aberto'
      : `Área no mapa aberto: ${n(m.area_m2)} m² (mínimo ${n(cfg.area_min_m2)} m²)`;
  const txtLojas =
    m.pois_mapped === null
      ? 'lojas no mapa aberto: ainda não contadas'
      : `lojas no mapa aberto: ${n(m.pois_mapped)} (mínimo ${n(cfg.lojas_min)})`;
  const fim = (g: boolean) => (g ? ' → grande.' : ' → não grande.');
  switch (cfg.criterio) {
    case 'todos':
      return { grande: true, por: 'criterio', conta: 'Critério "todos": todo shopping conta como grande.' };
    case 'area':
      return { grande: porArea, por: 'criterio', conta: `${txtArea}${fim(porArea)}` };
    case 'lojas': {
      const t = txtLojas.charAt(0).toUpperCase() + txtLojas.slice(1);
      return { grande: porLojas, por: 'criterio', conta: `${t}${fim(porLojas)}` };
    }
    case 'area_ou_lojas':
      return { grande: porArea || porLojas, por: 'criterio', conta: `${txtArea} ou ${txtLojas}${fim(porArea || porLojas)}` };
    case 'area_e_lojas':
      return { grande: porArea && porLojas, por: 'criterio', conta: `${txtArea} e ${txtLojas}${fim(porArea && porLojas)}` };
  }
}

// ── consultas ────────────────────────────────────────────────

/** Teto de shoppings pedidos ao Overpass numa busca (uma metrópole tem ~100). */
export const MAX_SHOPPINGS_OVERPASS = 500;
/** Raio máximo da busca de shoppings (arquitetura: até 30 km). */
export const RAIO_MAX_SHOPPINGS_M = 30_000;

export function montarQueryShoppings(centro: Coordenada, raioM: number): string {
  return `[out:json][timeout:60];\n(\n  nwr["shop"="mall"]${seletorRaio(centro, raioM)};\n);\nout geom ${MAX_SHOPPINGS_OVERPASS};`;
}

export type AlvoLojas = { tipo: 'area'; source_ref: string } | { tipo: 'raio'; centro: Coordenada; raio_m: number };

const REF_AREA = /^(way|relation)\/([1-9][0-9]{0,14})$/;

/**
 * Lojas dentro do shopping com os segmentos como perfil: polígono → `map_to_area` do próprio way/relation; ponto → raio em volta
 * (menos confiável). Mesmo cabeçalho, rodapé e linhas da busca comum (§36.3).
 */
export function montarQueryLojas(segmentos: readonly Segmento[], alvo: AlvoLojas): string {
  let prelude = '';
  let seletor: string;
  if (alvo.tipo === 'area') {
    const m = REF_AREA.exec(alvo.source_ref);
    if (!m) throw new Error('Referência de shopping inválida para a consulta.');
    prelude = `${m[1]}(${m[2]});map_to_area->.shop;\n`;
    seletor = '(area.shop)';
  } else {
    seletor = seletorRaio(alvo.centro, alvo.raio_m);
  }
  const linhas = segmentos.flatMap((s) => linhasDoSegmento(s, seletor));
  return `[out:json][timeout:25];\n${prelude}(\n${linhas.join('\n')}\n);\nout tags center ${MAX_ELEMENTOS_OVERPASS};`;
}
