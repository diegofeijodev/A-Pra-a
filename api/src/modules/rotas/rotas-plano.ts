/**
 * Persistência do plano do roteiro (contrato §23). Funções recebem o cliente do
 * Prisma (ou a transação) e NUNCA abrem transação própria: quem chama decide o
 * escopo. As contas (ordem, ETA, corte) ficam em `domain/rota-rules.ts`.
 */
import { ConflictException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { minutesSp, todaySp } from '../../common/time/dates';
import {
  calcularRelogio,
  planejar,
  type ConfigRota,
  type ParadaPlano,
  type ParamsPlano,
  type PontoRota,
  type Plano,
} from '../../domain/rota-rules';
import { novoSnapshot, paramsDaRota, lerSnapshot, type StopRow } from './rotas-views';

export type Db = Prisma.TransactionClient;

/** Situações em que a parada segura o lugar no dia (espelha o índice único parcial). */
export const SEGURA_LUGAR = ['pendente', 'visitada', 'adiada'] as const;

export const conflitoVersao = () =>
  new ConflictException({ code: 'ROUTE_VERSION_CONFLICT', message: 'O roteiro mudou enquanto você editava. Recarregue e tente de novo.' });

export const ehConflitoVersao = (e: unknown): boolean =>
  e instanceof ConflictException && (e.getResponse() as { code?: string }).code === 'ROUTE_VERSION_CONFLICT';

export interface LeadParaRota {
  id: string;
  name: string;
  address: string;
  phone: string;
  lat: number;
  lng: number;
}

/** Hora de saída: hoje vale agora (Brasília); outro dia, o início da janela. */
export function partidaDoDia(day: string, agora: Date, p: ParamsPlano): number {
  return day === todaySp(agora) ? minutesSp(agora) : p.janelaIni;
}

/** Última visitada (maior `seq`) ou o ponto de partida do roteiro. */
export function ultimaPosicao(stops: StopRow[], start: { lat: number; lng: number }): { lat: number; lng: number } {
  const v = stops.filter((s) => s.status === 'visitada').sort((a, b) => b.seq - a.seq)[0];
  return v ? { lat: v.lat_snap, lng: v.lng_snap } : start;
}

export const pontoDaParada = (s: StopRow): PontoRota => ({ id: s.lead_id, lat: s.lat_snap, lng: s.lng_snap, fixa: s.fixa });

export interface GravarPlano {
  route: { id: string; day: string; version: number; params_snapshot: unknown };
  /** Troca o modo de deslocamento do roteiro (§30.4); sem isto o modo atual é mantido. */
  modo?: { travel_mode: string; velocidade_carro_kmh: number | null };
  stops: StopRow[];
  plano: Plano;
  config: ConfigRota;
  /** Leads novos no roteiro (a parada guarda a fotografia). */
  leads: Map<string, LeadParaRota>;
  candidatos: Map<string, string>;
  fixas?: Map<string, boolean>;
  /** Leads com parada existente que saem do roteiro (viram `descartada`). */
  descartar: string[];
  motivo: string;
  por: string | null;
  agora: Date;
  start?: { lat: number; lng: number };
  areaId?: string | null;
}

/** Grava o plano no roteiro existente, com trava otimista em `version`. */
export async function gravarPlano(tx: Db, g: GravarPlano): Promise<void> {
  const r = await tx.field_routes.updateMany({
    where: { id: g.route.id, version: g.route.version },
    data: {
      version: { increment: 1 },
      params_snapshot: novoSnapshot(g.route.params_snapshot, g.config, g.plano.excedentes.length, g.route.version + 1, g.motivo, g.por, g.agora, g.modo?.velocidade_carro_kmh) as unknown as Prisma.InputJsonValue,
      ...(g.modo ? { travel_mode: g.modo.travel_mode } : {}),
      ...(g.start ? { start_lat: g.start.lat, start_lng: g.start.lng } : {}),
      ...(g.areaId !== undefined ? { area_id: g.areaId } : {}),
    },
  });
  if (r.count === 0) throw conflitoVersao();

  const porLead = new Map(g.stops.map((s) => [s.lead_id, s]));
  // Quem sai primeiro: libera o lugar antes de qualquer reentrada.
  for (const leadId of g.descartar) {
    const ex = porLead.get(leadId);
    if (ex && (ex.status === 'pendente' || ex.status === 'adiada')) {
      await tx.field_route_stops.update({ where: { id: ex.id }, data: { status: 'descartada', eta_min: null, deferred_to: null } });
    }
  }
  for (const p of g.plano.paradas) {
    const ex = porLead.get(p.id);
    const comum = {
      seq: p.seq,
      kind: p.kind,
      status: 'pendente',
      eta_min: p.eta_min,
      distance_m: p.distancia_m,
      planned_minutes: g.config.minutos_por_visita,
      skip_reason: null,
      skip_note: null,
      deferred_to: null,
      fixa: g.fixas?.get(p.id) ?? ex?.fixa ?? false,
    };
    if (ex) {
      await tx.field_route_stops.update({ where: { id: ex.id }, data: comum });
    } else {
      const lead = g.leads.get(p.id)!;
      await tx.field_route_stops.create({
        data: {
          ...comum,
          route_id: g.route.id,
          lead_id: lead.id,
          day: g.route.day,
          candidate_id: g.candidatos.get(lead.id) ?? null,
          name_snap: lead.name,
          address_snap: lead.address,
          phone_snap: lead.phone,
          lat_snap: lead.lat,
          lng_snap: lead.lng,
        },
      });
    }
  }
}

/**
 * Recalcula só kind/ETA/distância das paradas pendentes NA ORDEM ATUAL (usado ao
 * pular, adiar, desfazer e ao editar a ordem). Não muda `seq`.
 */
export async function recalcularEtas(
  tx: Db,
  route: { day: string; start_lat: number; start_lng: number; travel_mode: string; params_snapshot: unknown },
  stops: StopRow[],
  agora: Date,
): Promise<void> {
  // Modo do roteiro (a pé/carro, §30.4): pular, adiar e desfazer recalculam com a MESMA velocidade.
  const params = paramsDaRota(route);
  const pend = stops
    .filter((s) => s.status === 'pendente')
    .sort((a, b) => (a.kind === b.kind ? a.seq - b.seq : a.kind === 'planejada' ? -1 : 1));
  const plano = calcularRelogio({
    inicio: ultimaPosicao(stops, { lat: route.start_lat, lng: route.start_lng }),
    partidaMin: partidaDoDia(route.day, agora, params),
    ordem: pend.map(pontoDaParada),
    params,
    jaFeitas: stops.filter((s) => s.status === 'visitada').length,
  });
  const porLead = new Map(pend.map((s) => [s.lead_id, s]));
  for (const p of plano.paradas) {
    const s = porLead.get(p.id)!;
    if (s.kind !== p.kind || s.eta_min !== p.eta_min || s.distance_m !== p.distancia_m) {
      await tx.field_route_stops.update({ where: { id: s.id }, data: { kind: p.kind, eta_min: p.eta_min, distance_m: p.distancia_m } });
    }
  }
  // Pulada/adiada não têm horário.
  for (const s of stops) {
    if ((s.status === 'pulada' || s.status === 'adiada') && s.eta_min !== null) {
      await tx.field_route_stops.update({ where: { id: s.id }, data: { eta_min: null } });
    }
  }
}

export type { ParadaPlano };

/**
 * Refaz a ordem das paradas ainda por visitar a partir de `inicio` (posição atual): mantém as
 * visitadas e as fixas, traz reservas e adiadas da tarde e derruba o que não cabe. Sobe `version`.
 */
export async function reotimizar(
  tx: Db,
  rota: { id: string; day: string; version: number; params_snapshot: unknown; travel_mode: string; stops: StopRow[] },
  inicio: { lat: number; lng: number },
  agora: Date,
  motivo: string,
  por: string | null,
): Promise<void> {
  const snap = lerSnapshot(rota.params_snapshot);
  const params = paramsDaRota(rota);
  const grupo = (s: StopRow) => (s.status === 'adiada' ? 2 : s.kind === 'planejada' ? 0 : 1);
  const ordem = rota.stops
    .filter((s) => s.status === 'pendente' || (s.status === 'adiada' && s.deferred_to === 'tarde'))
    .sort((a, b) => grupo(a) - grupo(b) || a.seq - b.seq);
  const plano = planejar({
    inicio,
    partidaMin: partidaDoDia(rota.day, agora, params),
    pontos: ordem.map((s) => ({ ...pontoDaParada(s), depois: s.status === 'adiada' })),
    params,
    jaFeitas: rota.stops.filter((s) => s.status === 'visitada').length,
  });
  await gravarPlano(tx, {
    route: rota,
    stops: rota.stops,
    plano,
    config: snap.config,
    leads: new Map(),
    candidatos: new Map(),
    descartar: plano.excedentes,
    motivo,
    por,
    agora,
  });
}
