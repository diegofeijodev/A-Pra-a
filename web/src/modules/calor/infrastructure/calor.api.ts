import { z } from 'zod';
import { api } from '@/modules/shared/infrastructure/http';
import type { Camada } from '../domain/calor';

/** `HeatmapView` (§24.4 do contrato), validado na borda da rede. */
const celula = z.object({
  lat: z.number(),
  lng: z.number(),
  n: z.number(),
  leads: z.number().optional(),
  minutes: z.number().optional(),
  total: z.number().optional(),
  visited: z.number().optional(),
});
const base = {
  praca_id: z.string(),
  consultant_id: z.string().nullable(),
  area_id: z.string().nullable(),
  from: z.string(),
  to: z.string(),
  requested_cell_m: z.number(),
  cell: z.object({ m: z.number(), dlat: z.number(), dlng: z.number() }),
  cells: z.array(celula),
  max: z.number(),
  truncated: z.boolean(),
  note: z.string().nullable(),
};
export const heatmapSchema = z.discriminatedUnion('layer', [
  z.object({
    ...base,
    layer: z.literal('visitas'),
    summary: z.object({ visits: z.number(), leads: z.number(), consultants: z.array(z.object({ id: z.string(), name: z.string(), visits: z.number() })) }),
  }),
  z.object({ ...base, layer: z.literal('passagem'), summary: z.object({ points: z.number(), minutes: z.number() }) }),
  z.object({
    ...base,
    layer: z.literal('cobertura'),
    summary: z.object({ leads_total: z.number(), leads_visited: z.number(), leads_missing: z.number(), percent: z.number() }),
  }),
]);
export type HeatmapView = z.infer<typeof heatmapSchema>;

export interface HeatmapParams {
  praca_id: string;
  layer: Camada;
  from: string;
  to: string;
  consultant_id?: string | null;
  cell_m?: number;
  bbox?: string | null;
}

export async function getHeatmap(p: HeatmapParams): Promise<HeatmapView> {
  const params: Record<string, string | number> = { praca_id: p.praca_id, layer: p.layer, from: p.from, to: p.to };
  if (p.consultant_id) params.consultant_id = p.consultant_id;
  if (p.cell_m) params.cell_m = p.cell_m;
  if (p.bbox) params.bbox = p.bbox;
  const { data } = await api.get('/v1/consultores/heatmap', { params });
  return heatmapSchema.parse(data);
}
