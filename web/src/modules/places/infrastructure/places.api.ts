import { z } from 'zod';
import { api } from '@/modules/shared/infrastructure/http';

/** Pesquisa automática de estabelecimentos (§22 do contrato), validada na borda da rede. */

export const TIPOS_LUGAR = ['bar', 'restaurante', 'lanchonete', 'padaria', 'cafe'] as const;
export type TipoLugar = (typeof TIPOS_LUGAR)[number];
export type FonteLugar = 'osm' | 'apify';

export const searchRunSchema = z.object({
  id: z.string(),
  praca_id: z.string(),
  area_id: z.string(),
  area_name: z.string(),
  source: z.string(),
  types: z.array(z.string()),
  center: z.object({ lat: z.number(), lng: z.number() }),
  radius_m: z.number(),
  status: z.enum(['queued', 'running', 'done', 'error', 'cancelled']),
  found: z.number(),
  novos: z.number(),
  duplicados: z.number(),
  descartados: z.number(),
  truncated: z.boolean(),
  est_cost_usd: z.number(),
  error: z.string().nullable(),
  cached: z.boolean(),
  requested_by: z.string(),
  created_at: z.string(),
  started_at: z.string().nullable(),
  finished_at: z.string().nullable(),
  expires_at: z.string().nullable(),
});
export type SearchRunView = z.infer<typeof searchRunSchema>;

export const candidateSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  address: z.string(),
  lat: z.number(),
  lng: z.number(),
  location_precision: z.string(),
  distance_m: z.number(),
  phone: z.string(),
  website: z.string().nullable(),
  source: z.string(),
  status: z.enum(['novo', 'duplicado', 'descartado', 'adicionado']),
  reason: z.string().nullable(),
  lead_id: z.string().nullable(),
  lead_name: z.string().nullable(),
  selectable: z.boolean(),
});
export type CandidateView = z.infer<typeof candidateSchema>;

export const sourceSchema = z.object({
  id: z.enum(['osm', 'apify']),
  label: z.string(),
  available: z.boolean(),
  paid: z.boolean(),
  max_places_per_run: z.number().optional(),
  monthly_cap: z.number().optional(),
  used_this_month: z.number().optional(),
  est_cost_usd_per_run: z.number().optional(),
});
export type SourceView = z.infer<typeof sourceSchema>;

export const addLeadsSchema = z.object({
  batch_id: z.string(),
  created: z.number(),
  skipped: z.array(z.object({ candidate_id: z.string(), reason: z.string() })),
});
export type AddLeadsView = z.infer<typeof addLeadsSchema>;

export interface StartSearchInput {
  praca_id: string;
  area_id: string;
  types: TipoLugar[];
  source?: FonteLugar;
  refresh?: boolean;
}

export async function listSources(): Promise<SourceView[]> {
  const { data } = await api.get('/v1/place-searches/sources');
  return z.array(sourceSchema).parse(data);
}

export async function listSearches(pracaId: string): Promise<SearchRunView[]> {
  const { data } = await api.get('/v1/place-searches', { params: { praca_id: pracaId } });
  return z.array(searchRunSchema).parse(data);
}

export async function getSearch(id: string, pracaId: string): Promise<SearchRunView> {
  const { data } = await api.get(`/v1/place-searches/${id}`, { params: { praca_id: pracaId } });
  return searchRunSchema.parse(data);
}

export async function startSearch(input: StartSearchInput): Promise<SearchRunView> {
  const { data } = await api.post('/v1/place-searches', input);
  return searchRunSchema.parse(data);
}

export async function cancelSearch(id: string, pracaId: string): Promise<SearchRunView> {
  const { data } = await api.post(`/v1/place-searches/${id}/cancel`, null, { params: { praca_id: pracaId } });
  return searchRunSchema.parse(data);
}

export async function listCandidates(id: string, pracaId: string): Promise<CandidateView[]> {
  const { data } = await api.get(`/v1/place-searches/${id}/candidates`, { params: { praca_id: pracaId } });
  return z.array(candidateSchema).parse(data);
}

export async function addLeads(id: string, pracaId: string, candidateIds: string[]): Promise<AddLeadsView> {
  const { data } = await api.post(`/v1/place-searches/${id}/leads`, { praca_id: pracaId, candidate_ids: candidateIds });
  return addLeadsSchema.parse(data);
}
