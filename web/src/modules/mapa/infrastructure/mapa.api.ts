import { api } from '@/modules/shared/infrastructure/http';

export type StatusNoMapa = 'nao_visitado' | 'visitado' | 'cadastrado' | 'com_vaga';

/** Contrato §21.2. */
export interface MapPoint {
  id: string;
  name: string;
  lat: number;
  lng: number;
  cnae: string | null;
  classe: string;
  status: StatusNoMapa;
}

export interface MapaView {
  points: MapPoint[];
  sem_localizacao: number;
  cnaes: { code: string | null; label: string; count: number }[];
}

export interface GeoResumo {
  pendente: number;
  ok: number;
  falhou: number;
  sem_endereco: number;
  geocoder: 'nominatim' | 'google' | 'off';
}

export async function getMapa(pracaId: string, cnaes: string[]): Promise<MapaView> {
  const { data } = await api.get(`/v1/pracas/${pracaId}/mapa`, { params: cnaes.length ? { cnae: cnaes.join(',') } : {} });
  return data as MapaView;
}

export async function getGeo(pracaId: string): Promise<GeoResumo> {
  const { data } = await api.get(`/v1/pracas/${pracaId}/geo`);
  return data as GeoResumo;
}

export async function retryGeo(pracaId: string): Promise<{ requeued: number }> {
  const { data } = await api.post(`/v1/pracas/${pracaId}/geo/retry`);
  return data as { requeued: number };
}
