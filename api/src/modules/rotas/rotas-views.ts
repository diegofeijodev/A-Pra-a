import type { Prisma } from '@prisma/client';
import { minutesSp, todaySp } from '../../common/time/dates';
import { lerConfigRota, minParaHhmm, paramsDaConfig, ritmo, textoDoModo, velocidadeDoModo, type ConfigRota, type ParamsPlano } from '../../domain/rota-rules';
import { velocidadeCarroKmh } from './rotas.tokens';

export type StopRow = Prisma.field_route_stopsGetPayload<object>;
/** A parada leva o resultado da visita: "fechado" (§30.1) não conta como visita feita na meta. */
export type StopComVisita = StopRow & { visit?: { outcome: string } | null };
export type RouteRow = Omit<Prisma.field_routesGetPayload<{ include: { stops: true; consultant: { select: { name: true } } } }>, 'stops'> & { stops: StopComVisita[] };

export interface StopView {
  id: string;
  route_id: string;
  lead_id: string;
  seq: number;
  kind: string;
  status: string;
  fixa: boolean;
  eta: string | null;
  eta_min: number | null;
  planned_minutes: number;
  distance_m: number;
  name: string;
  address: string;
  phone: string;
  lat: number;
  lng: number;
  skip_reason: string | null;
  skip_note: string | null;
  deferred_to: string | null;
  visit_id: string | null;
}

export interface RouteView {
  id: string;
  consultant_id: string;
  consultant_name: string;
  praca_id: string;
  day: string;
  status: string;
  version: number;
  source: string;
  area_id: string | null;
  start: { lat: number; lng: number };
  params: ConfigRota;
  /** Modo de deslocamento e a conta usada no relógio (contrato §30.4). */
  travel_mode: string;
  travel: { mode: string; speed_kmh: number; detour_factor: number; text: string };
  stops: StopView[];
  plan: { planned: number; reserve: number; walk_km: number; fits_meta: boolean; not_fit: number };
  progress: { meta: number; done: number; skipped: number; deferred: number; pending: number; expected_now: number; delta: number };
  generated_at: string;
  updated_at: string;
}

/** Conteúdo de `field_routes.params_snapshot`. */
export interface ParamsSnapshot {
  config: ConfigRota;
  /** Velocidade de carro fotografada quando o modo carro foi escolhido (fora de `config`, que limita a 15 km/h). */
  velocidade_carro_kmh: number | null;
  not_fit: number;
  versoes: { version: number; at: string; motivo: string; por: string | null }[];
}

export function lerSnapshot(raw: unknown): ParamsSnapshot {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const versoes = Array.isArray(o.versoes) ? (o.versoes as ParamsSnapshot['versoes']) : [];
  const kmh = typeof o.velocidade_carro_kmh === 'number' && o.velocidade_carro_kmh >= 5 && o.velocidade_carro_kmh <= 80 ? o.velocidade_carro_kmh : null;
  return { config: lerConfigRota(o.config), velocidade_carro_kmh: kmh, not_fit: typeof o.not_fit === 'number' ? o.not_fit : 0, versoes };
}

export function novoSnapshot(
  anterior: unknown,
  config: ConfigRota,
  notFit: number,
  version: number,
  motivo: string,
  por: string | null,
  agora: Date,
  /** `undefined` mantém a velocidade fotografada; um número a regrava; `null` limpa. */
  velocidadeCarro?: number | null,
): ParamsSnapshot {
  const velho = lerSnapshot(anterior);
  return {
    config,
    velocidade_carro_kmh: velocidadeCarro !== undefined ? velocidadeCarro : velho.velocidade_carro_kmh,
    not_fit: notFit,
    versoes: [...velho.versoes, { version, at: agora.toISOString(), motivo, por }].slice(-20),
  };
}

/** Velocidade do roteiro: a pé = configuração; carro = a fotografada (ou a do env, se o roteiro for antigo). */
export function velocidadeDaRota(rota: { travel_mode: string; params_snapshot: unknown }): number {
  const snap = lerSnapshot(rota.params_snapshot);
  return velocidadeDoModo(rota.travel_mode, snap.config, snap.velocidade_carro_kmh ?? velocidadeCarroKmh());
}

/** Parâmetros do relógio de um roteiro EXISTENTE (use em todo cálculo sobre ele: pular, adiar, ordenar, refazer, ler). */
export function paramsDaRota(rota: { travel_mode: string; params_snapshot: unknown }): ParamsPlano {
  return paramsDaConfig(lerSnapshot(rota.params_snapshot).config, velocidadeDaRota(rota));
}

export const stopView = (s: StopRow): StopView => ({
  id: s.id,
  route_id: s.route_id,
  lead_id: s.lead_id,
  seq: s.seq,
  kind: s.kind,
  status: s.status,
  fixa: s.fixa,
  eta: s.eta_min == null ? null : minParaHhmm(s.eta_min),
  eta_min: s.eta_min,
  planned_minutes: s.planned_minutes,
  distance_m: s.distance_m,
  name: s.name_snap,
  address: s.address_snap,
  phone: s.phone_snap,
  lat: s.lat_snap,
  lng: s.lng_snap,
  skip_reason: s.skip_reason,
  skip_note: s.skip_note,
  deferred_to: s.deferred_to,
  visit_id: s.visit_id,
});

/** `descartada` só interessa à equipe; o consultor nunca a vê. */
export function routeView(r: RouteRow, agora: Date, incluirDescartadas = false): RouteView {
  const snap = lerSnapshot(r.params_snapshot);
  const params = paramsDaRota(r);
  const kmh = velocidadeDaRota(r);
  const stops = [...r.stops]
    .filter((s) => incluirDescartadas || s.status !== 'descartada')
    .sort((a, b) => a.seq - b.seq || (a.id < b.id ? -1 : 1));
  const conta = (f: (s: StopComVisita) => boolean) => stops.filter(f).length;
  const pendentesPlan = stops.filter((s) => s.status === 'pendente' && s.kind === 'planejada');
  // "Fechado" (§30.1) fica fora da conta de visitas feitas para a meta; a parada segue visitada (não trava o roteiro).
  const done = conta((s) => s.status === 'visitada' && s.visit?.outcome !== 'fechado');
  const hoje = todaySp(agora);
  const r0 = ritmo({
    agoraMin: r.day === hoje ? minutesSp(agora) : r.day < hoje ? params.janelaFim : 0,
    feitas: done,
    params,
  });
  return {
    id: r.id,
    consultant_id: r.consultant_id,
    consultant_name: r.consultant.name,
    praca_id: r.praca_id,
    day: r.day,
    status: r.status,
    version: r.version,
    source: r.source,
    area_id: r.area_id,
    start: { lat: r.start_lat, lng: r.start_lng },
    params: snap.config,
    travel_mode: r.travel_mode,
    travel: { mode: r.travel_mode, speed_kmh: kmh, detour_factor: snap.config.fator_desvio, text: textoDoModo(r.travel_mode, kmh, snap.config.fator_desvio) },
    stops: stops.map(stopView),
    plan: {
      planned: pendentesPlan.length,
      reserve: conta((s) => s.status === 'pendente' && s.kind === 'reserva'),
      walk_km: Math.round(pendentesPlan.reduce((t, s) => t + s.distance_m, 0) / 100) / 10,
      fits_meta: done + pendentesPlan.length >= snap.config.meta_diaria,
      not_fit: snap.not_fit,
    },
    progress: {
      meta: snap.config.meta_diaria,
      done,
      skipped: conta((s) => s.status === 'pulada'),
      deferred: conta((s) => s.status === 'adiada'),
      pending: pendentesPlan.length,
      expected_now: r0.esperadas,
      delta: r0.delta,
    },
    generated_at: r.created_at.toISOString(),
    updated_at: r.updated_at.toISOString(),
  };
}

export const COM_PARADAS = { stops: { include: { visit: { select: { outcome: true } } } }, consultant: { select: { name: true } } } as const;
