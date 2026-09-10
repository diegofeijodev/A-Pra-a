import { api } from '@/modules/shared/infrastructure/http';

/**
 * `Municipio` (§5). A base do IBGE saiu do bundle do navegador (500 KB) e vive
 * na API, servida por UF. A regra `EXCLUIR` ("Rio de Janeiro" e "São Paulo"
 * nunca aparecem) também é do servidor.
 */
export interface Municipio {
  ibge: string;
  nome: string;
  uf: string;
  lat: number;
  lon: number;
  pop: number;
  capital: boolean;
}

export interface Vizinha extends Municipio {
  /** Distância até o centro, em km (haversine, sem arredondar). */
  km: number;
}

export interface VizinhasView {
  centro: Municipio;
  raio_km: number;
  vizinhas: Vizinha[];
  /** Soma da população das vizinhas MAIS a do centro. */
  pop_total: number;
}

export async function listEstados(): Promise<string[]> {
  const { data } = await api.get('/v1/geo/estados');
  return data as string[];
}

export async function listMunicipios(uf: string): Promise<Municipio[]> {
  const { data } = await api.get('/v1/geo/municipios', { params: { uf } });
  return data as Municipio[];
}

export async function fetchVizinhas(ibge: string, km: number): Promise<VizinhasView> {
  const { data } = await api.get(`/v1/geo/municipios/${ibge}/vizinhas`, { params: { km } });
  return data as VizinhasView;
}
