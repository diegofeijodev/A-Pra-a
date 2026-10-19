/**
 * Mapa de calor e cobertura (F4, contrato §24) — regras puras, sem Prisma nem HTTP.
 *
 * A agregação em si roda no banco (`GROUP BY floor(lat/Δlat), floor(lng/Δlng)`); aqui moram a
 * definição da grade (a MESMA fórmula do SQL), a conversão célula → centro, o teto de volume e as
 * validações de período e de recorte. Nada daqui devolve coordenada de ponto real: só centro de célula.
 */
import { addDays, daysBetween, isDateString } from '../common/time/dates';
import { BRASIL } from './area-rules';
import type { Coordenada } from './campo-rules';

export const CELULAS_M = [100, 250, 500, 1000] as const;
export const CELULA_PADRAO_M = 250;
export const MAX_CELULAS = 5000;
export const MAX_DIAS = 92;
export const MINUTOS_POR_PONTO = 5;
export const LADO_MAX_BBOX_GRAUS = 3;
const METROS_POR_GRAU = 111_320;
const rad = (g: number) => (g * Math.PI) / 180;

export interface TamanhoCelula {
  m: number;
  dlat: number;
  dlng: number;
}
export interface Celula {
  i: number;
  j: number;
}

/** Latitude de referência da grade: arredondada ao grau, para a grade não "andar" ao arrastar o mapa. */
export const latReferencia = (lat: number): number => Math.round(lat);

export function tamanhoCelula(m: number, latRef: number): TamanhoCelula {
  return { m, dlat: m / METROS_POR_GRAU, dlng: m / (METROS_POR_GRAU * Math.max(Math.cos(rad(latRef)), 0.01)) };
}

/** Célula do ponto — a mesma conta do SQL (`floor(lat / dlat)`), alinhada à origem (0°, 0°). */
export function celulaDe(p: Coordenada, t: TamanhoCelula): Celula {
  return { i: Math.floor(p.lat / t.dlat), j: Math.floor(p.lng / t.dlng) };
}

export function centroDaCelula(c: Celula, t: TamanhoCelula): Coordenada {
  return { lat: (c.i + 0.5) * t.dlat, lng: (c.j + 0.5) * t.dlng };
}

/** Próximo tamanho da escada (100→250→500→1000); `null` no topo. */
export function proximaCelula(m: number): number | null {
  const k = CELULAS_M.findIndex((x) => x === m);
  return k >= 0 && k < CELULAS_M.length - 1 ? CELULAS_M[k + 1] : null;
}

export const celulaPermitida = (m: number): boolean => (CELULAS_M as readonly number[]).includes(m);

export interface LinhaCelula {
  i: number;
  j: number;
  n: number;
}
export type CelulaView<T extends LinhaCelula> = Omit<T, 'i' | 'j'> & Coordenada;

/**
 * Linhas do `GROUP BY` → células com centro. Ordena por peso (maior primeiro; empate por i,j, determinístico),
 * corta no teto e informa o maior peso. `descartarZero` tira as de `n = 0` (cobertura toda visitada).
 */
export function montarCelulas<T extends LinhaCelula>(
  linhas: T[],
  t: TamanhoCelula,
  teto: number = MAX_CELULAS,
  opcoes: { descartarZero?: boolean } = {},
): { cells: CelulaView<T>[]; max: number; truncated: boolean } {
  const uteis = opcoes.descartarZero ? linhas.filter((l) => l.n > 0) : [...linhas];
  uteis.sort((a, b) => b.n - a.n || a.i - b.i || a.j - b.j);
  const truncated = uteis.length > teto;
  const cells = uteis.slice(0, teto).map((l) => {
    const { i, j, ...resto } = l;
    return { ...resto, ...centroDaCelula({ i, j }, t) } as CelulaView<T>;
  });
  return { cells, max: cells.length ? cells[0].n : 0, truncated };
}

export interface ResumoCobertura {
  leads_total: number;
  leads_visited: number;
  leads_missing: number;
  percent: number;
}
export function resumoCobertura(total: number, visitados: number): ResumoCobertura {
  const visited = Math.min(visitados, total);
  return {
    leads_total: total,
    leads_visited: visited,
    leads_missing: total - visited,
    percent: total > 0 ? Math.round((visited / total) * 100) : 0,
  };
}

/** Trajeto amostrado a cada ~5 min com a tela aberta: minutos APROXIMADOS. */
export const minutosAproximados = (pontosTrack: number): number => pontosTrack * MINUTOS_POR_PONTO;

export type Validacao<T> = ({ ok: true } & T) | { ok: false; erro: string };

/** Período em dias de Brasília: `to` padrão = hoje, `from` padrão = `to`; até 92 dias, inclusive. */
export function validarPeriodo(q: { from?: string; to?: string }, hoje: string): Validacao<{ from: string; to: string }> {
  for (const [campo, v] of [['from', q.from], ['to', q.to]] as const) {
    if (v !== undefined && !isDateString(v)) return { ok: false, erro: `${campo}: deve ser uma data válida no formato YYYY-MM-DD` };
  }
  const to = q.to ?? hoje;
  const from = q.from ?? to;
  if (from > to) return { ok: false, erro: 'from: não pode ser depois de to' };
  if (daysBetween(from, to) + 1 > MAX_DIAS) {
    return { ok: false, erro: `Período grande demais: use no máximo ${MAX_DIAS} dias (de ${addDays(to, -(MAX_DIAS - 1))} a ${to}).` };
  }
  return { ok: true, from, to };
}

export interface Bbox {
  sul: number;
  oeste: number;
  norte: number;
  leste: number;
}

/** `sul,oeste,norte,leste` em graus decimais, dentro do Brasil e com no máximo 3° de lado. */
export function validarBbox(texto: string): Validacao<{ bbox: Bbox }> {
  const erro = (m: string) => ({ ok: false as const, erro: `bbox: ${m}` });
  const partes = texto.split(',').map((s) => s.trim());
  if (partes.length !== 4 || partes.some((s) => !/^-?\d+(\.\d+)?$/.test(s))) return erro('use sul,oeste,norte,leste em graus decimais.');
  const [sul, oeste, norte, leste] = partes.map(Number);
  if (sul >= norte || oeste >= leste) return erro('o sul precisa ser menor que o norte e o oeste menor que o leste.');
  if (sul < BRASIL.latMin || norte > BRASIL.latMax || oeste < BRASIL.lngMin || leste > BRASIL.lngMax) return erro('a janela precisa estar dentro do Brasil.');
  if (norte - sul > LADO_MAX_BBOX_GRAUS || leste - oeste > LADO_MAX_BBOX_GRAUS) return erro(`a janela passa de ${LADO_MAX_BBOX_GRAUS} graus de lado.`);
  return { ok: true, bbox: { sul, oeste, norte, leste } };
}
