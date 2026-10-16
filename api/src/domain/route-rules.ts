// Regras puras das rotas de visita (bloco B, contrato §21.1 e §21.5).
// Sem banco, sem relógio: tudo que depende de "hoje" recebe o dia de fora.
import { addDays, weekdayOf } from '../common/time/dates';
import { distanciaM, type Coordenada } from './campo-rules';
import { norm } from './dedup';

/** Semana de rota: segunda a sábado (decisão do dono, 16/10). */
export const DIAS_DE_ROTA = 6;

/** Segunda-feira da semana de `dia`. Domingo pertence à semana que terminou no sábado anterior. */
export function segundaDaSemana(dia: string): string {
  const wd = weekdayOf(dia); // 0 = domingo
  return addDays(dia, wd === 0 ? -6 : 1 - wd);
}

/** Os seis dias de rota (seg → sáb) da semana de `dia`. */
export function diasDaSemana(dia: string): string[] {
  const seg = segundaDaSemana(dia);
  return Array.from({ length: DIAS_DE_ROTA }, (_, i) => addDays(seg, i));
}

/** Sábado da semana de `dia` — validade do voucher. No domingo, o sábado seguinte. */
export function sabadoDaSemana(dia: string): string {
  return weekdayOf(dia) === 0 ? addDays(dia, 6) : addDays(segundaDaSemana(dia), 5);
}

/** Idade completa em `hoje` (as duas datas `YYYY-MM-DD`). */
export function idade(nascimento: string, hoje: string): number {
  const [ny, nm, nd] = nascimento.split('-').map(Number) as [number, number, number];
  const [hy, hm, hd] = hoje.split('-').map(Number) as [number, number, number];
  return hy - ny - (hm < nm || (hm === nm && hd < nd) ? 1 : 0);
}

export interface Area {
  lat: number | null;
  lng: number | null;
  radius_km: number | null;
  bairros: string[];
}

export const semArea = (a: Area): boolean =>
  !(a.radius_km && a.lat != null && a.lng != null) && a.bairros.length === 0;

/** Bairro comparável: sem acento, sem caixa, sem pontuação. */
export const chaveBairro = (b: string | null | undefined): string => norm(b ?? '');

/**
 * O lead está na área? Raio **ou** bairro; sem nenhum dos dois, a praça
 * inteira (§21.5). Lead sem localização nunca está — não dá para rotear.
 */
export function dentroDaArea(
  lead: { lat: number | null; lng: number | null; bairro: string | null },
  area: Area,
): boolean {
  if (lead.lat == null || lead.lng == null) return false;
  if (semArea(area)) return true;
  if (area.radius_km && area.lat != null && area.lng != null) {
    if (distanciaM({ lat: area.lat, lng: area.lng }, { lat: lead.lat, lng: lead.lng }) <= area.radius_km * 1000) {
      return true;
    }
  }
  if (area.bairros.length && lead.bairro) {
    const k = chaveBairro(lead.bairro);
    if (k && area.bairros.some((b) => chaveBairro(b) === k)) return true;
  }
  return false;
}

export type MotivoParada = 'novo' | 'retorno' | 'pendente' | 'incluido';

export interface Candidato {
  id: string;
  lat: number;
  lng: number;
  /** 0 retorno · 1 pendente · 2 casa grande nova · 3 alvo novo · 4 o resto. Menor vai primeiro. */
  rank: number;
  reason: Exclude<MotivoParada, 'incluido'>;
  /** Só para `retorno`: o dia combinado com o cliente. */
  dia?: string;
}

export interface ParadaPlanejada {
  lead_id: string;
  reason: Exclude<MotivoParada, 'incluido'>;
}

const porRankEId = (a: Candidato, b: Candidato) => a.rank - b.rank || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

function centroDe(pontos: Coordenada[]): Coordenada | null {
  if (!pontos.length) return null;
  return {
    lat: pontos.reduce((s, p) => s + p.lat, 0) / pontos.length,
    lng: pontos.reduce((s, p) => s + p.lng, 0) / pontos.length,
  };
}

/**
 * Ordem por vizinho mais próximo, começando pela parada mais perto de
 * `inicio`. Empate de distância decide pelo id (mesma entrada, mesma rota).
 */
export function ordemVizinho<T extends { id: string; lat: number; lng: number }>(
  pontos: T[],
  inicio: Coordenada | null,
): T[] {
  const resto = [...pontos].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (resto.length <= 1) return resto;
  const fora: T[] = [];
  let atual: Coordenada = inicio ?? resto[0]!;
  while (resto.length) {
    let melhor = 0;
    let menor = Infinity;
    resto.forEach((p, i) => {
      const d = distanciaM(atual, p);
      if (d < menor) {
        menor = d;
        melhor = i;
      }
    });
    const [p] = resto.splice(melhor, 1);
    fora.push(p!);
    atual = p!;
  }
  return fora;
}

/**
 * Divide os candidatos pelos `dias` (§21.5): retornos no dia combinado (até a
 * meta do dia; vencidos antes da semana entram como prioridade máxima no
 * bolo), o resto pelos `meta × dias` melhores, ordenados pelo ângulo em volta
 * do centro e cortados em blocos de `meta` — cada dia numa região. Dentro do
 * dia, vizinho mais próximo a partir da parada mais perto do centro.
 */
export function planejarSemana(input: {
  candidatos: Candidato[];
  dias: string[];
  meta: number;
  centro: Coordenada | null;
}): Map<string, ParadaPlanejada[]> {
  const { dias, meta } = input;
  const primeiro = dias[0];
  const ultimo = dias[dias.length - 1];
  const fixos = new Map<string, Candidato[]>(dias.map((d) => [d, []]));
  const bolo: Candidato[] = [];
  const vistos = new Set<string>();

  for (const c of [...input.candidatos].sort(porRankEId)) {
    if (vistos.has(c.id)) continue;
    vistos.add(c.id);
    if (c.reason === 'retorno' && c.dia) {
      if (ultimo && c.dia > ultimo) continue; // combinado para outra semana
      const doDia = fixos.get(c.dia);
      if (doDia && doDia.length < meta) {
        doDia.push(c);
        continue;
      }
      // Vencido antes da semana (ou dia já cheio): disputa o bolo com prioridade máxima.
      if (primeiro && c.dia < primeiro) {
        bolo.push(c);
        continue;
      }
    }
    bolo.push(c);
  }

  const vagas = dias.map((d) => Math.max(0, meta - fixos.get(d)!.length));
  const escolhidos = bolo.sort(porRankEId).slice(0, vagas.reduce((s, n) => s + n, 0));
  const centro =
    input.centro ?? centroDe([...escolhidos, ...[...fixos.values()].flat()]) ?? { lat: 0, lng: 0 };

  const angulo = (p: Coordenada) => Math.atan2(p.lat - centro.lat, p.lng - centro.lng);
  escolhidos.sort(
    (a, b) =>
      angulo(a) - angulo(b) ||
      distanciaM(centro, a) - distanciaM(centro, b) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );

  const out = new Map<string, ParadaPlanejada[]>();
  let i = 0;
  dias.forEach((dia, k) => {
    const doDia = [...fixos.get(dia)!, ...escolhidos.slice(i, i + vagas[k]!)];
    i += vagas[k]!;
    out.set(
      dia,
      ordemVizinho(doDia, centro).map((c) => ({ lead_id: c.id, reason: c.reason })),
    );
  });
  return out;
}

/** Prioridade do candidato que não é retorno nem pendente. */
export function rankDoNovo(classe: string, jaVisitado: boolean): number {
  if (jaVisitado) return 4;
  if (classe === 'grande') return 2;
  if (classe === 'alvo') return 3;
  return 4;
}

/** CNAE em 7 dígitos (`5611-2/01` → `5611201`); qualquer outra coisa vira `null`. */
export function normalizarCnae(v: unknown): string | null {
  if (v == null) return null;
  const d = String(v).replace(/\D/g, '');
  return d.length === 7 ? d : null;
}

/** Latitude/longitude de planilha: aceita vírgula decimal; fora de faixa vira `null`. */
export function lerCoordenada(v: unknown, limite: 90 | 180): number | null {
  if (v == null) return null;
  const s = String(v).trim().replace(',', '.');
  if (!s || !/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) && Math.abs(n) <= limite && n !== 0 ? n : null;
}
