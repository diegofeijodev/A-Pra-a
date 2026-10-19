import { z } from 'zod';
import { api } from '@/modules/shared/infrastructure/http';

/** `AreaView` (§21 do contrato), validado na borda da rede. */
export const areaViewSchema = z.object({
  id: z.string(),
  praca_id: z.string(),
  name: z.string(),
  lat: z.number(),
  lng: z.number(),
  radius_m: z.number(),
  active: z.boolean(),
  created_at: z.string(),
});
export type AreaView = z.infer<typeof areaViewSchema>;

export interface CreateAreaInput {
  praca_id: string;
  name: string;
  lat: number;
  lng: number;
  radius_m: number;
}

export interface UpdateAreaInput {
  name?: string;
  lat?: number;
  lng?: number;
  radius_m?: number;
  active?: boolean;
}

export async function listAreas(pracaId: string): Promise<AreaView[]> {
  const { data } = await api.get('/v1/areas', { params: { praca_id: pracaId } });
  return z.array(areaViewSchema).parse(data);
}

export async function createArea(input: CreateAreaInput): Promise<AreaView> {
  const { data } = await api.post('/v1/areas', input);
  return areaViewSchema.parse(data);
}

export async function updateArea(id: string, pracaId: string, input: UpdateAreaInput): Promise<AreaView> {
  const { data } = await api.patch(`/v1/areas/${id}`, input, { params: { praca_id: pracaId } });
  return areaViewSchema.parse(data);
}
