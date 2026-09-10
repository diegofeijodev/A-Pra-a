import { api } from '@/modules/shared/infrastructure/http';

/** `cobertura` de uma praça já resolvida pela API a partir do código do IBGE. */
export interface Cobertura {
  uf: string;
  cidade: string;
  ibge: string;
  lat: number;
  lon: number;
  vizinhas: string[];
}

export interface StepState {
  actual: number | null;
  unlock: { by: string; at: string; reason: string } | null;
}

/** `PracaView` (§6 do contrato). */
export interface PracaView {
  id: string;
  name: string;
  city: string;
  start_date: string;
  end_date: string;
  cobertura: Cobertura | null;
  steps: Record<string, StepState>;
  created_at: string;
}

/** No `POST`, `cobertura` entra como `{ibge, km?}` — UF, lat/lon e vizinhas
 *  saem do `GeoService`, nunca do cliente. */
export interface CreatePracaInput {
  name: string;
  city: string;
  start_date: string;
  end_date: string;
  cobertura?: { ibge: string; km?: number };
}

export interface UpdatePracaInput {
  name?: string;
  city?: string;
  start_date?: string;
  end_date?: string;
}

export async function listPracas(): Promise<PracaView[]> {
  const { data } = await api.get('/v1/pracas');
  return data as PracaView[];
}

export async function createPraca(input: CreatePracaInput): Promise<PracaView> {
  const { data } = await api.post('/v1/pracas', input);
  return data as PracaView;
}

export async function updatePraca(id: string, input: UpdatePracaInput): Promise<PracaView> {
  const { data } = await api.patch(`/v1/pracas/${id}`, input);
  return data as PracaView;
}

export async function recalcDates(id: string): Promise<{ ok: boolean; updated: number }> {
  const { data } = await api.post(`/v1/pracas/${id}/recalc-dates`);
  return data as { ok: boolean; updated: number };
}
