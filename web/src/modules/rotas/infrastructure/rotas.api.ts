import { z } from 'zod';
import { api } from '@/modules/shared/infrastructure/http';
import {
  candidateViewSchema,
  configRotaViewSchema,
  routeViewSchema,
  type CandidateView,
  type ConfigRota,
  type ConfigRotaView,
  type RouteView,
} from '../domain/rota.schema';

/** Roteiros vistos e montados pela equipe — contrato §23.4, validados na borda da rede. */
export async function listRoutes(day: string, pracaId?: string): Promise<RouteView[]> {
  const { data } = await api.get('/v1/routes', { params: { day, ...(pracaId ? { praca_id: pracaId } : {}) } });
  return z.array(routeViewSchema).parse(data);
}

export async function listRouteCandidates(p: { pracaId: string; day: string; areaId?: string; q?: string }): Promise<CandidateView[]> {
  const { data } = await api.get('/v1/routes/candidates', {
    params: { praca_id: p.pracaId, day: p.day, limit: 200, ...(p.areaId ? { area_id: p.areaId } : {}), ...(p.q ? { q: p.q } : {}) },
  });
  return z.array(candidateViewSchema).parse(data);
}

export interface BuildRouteInput {
  consultant_id: string;
  day: string;
  lead_ids: string[];
  area_id?: string;
}

export async function buildRoute(input: BuildRouteInput): Promise<RouteView> {
  const { data } = await api.post('/v1/routes', input);
  return routeViewSchema.parse(data);
}

export async function orderRoute(id: string, body: { version: number; stops: { id: string; fixa: boolean }[] }): Promise<RouteView> {
  const { data } = await api.put(`/v1/routes/${id}/order`, body);
  return routeViewSchema.parse(data);
}

export async function reoptimizeRoute(id: string): Promise<RouteView> {
  const { data } = await api.post(`/v1/routes/${id}/reoptimize`, {});
  return routeViewSchema.parse(data);
}

export async function getRotaConfig(): Promise<ConfigRotaView> {
  const { data } = await api.get('/v1/consultores/settings/config');
  return configRotaViewSchema.parse(data);
}

export async function putRotaConfig(body: Partial<ConfigRota>): Promise<ConfigRotaView> {
  const { data } = await api.put('/v1/consultores/settings/config', body);
  return configRotaViewSchema.parse(data);
}
