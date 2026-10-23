import { campoApi } from '@/modules/campo/infrastructure/campo-http';
import { api } from '@/modules/shared/infrastructure/http';
import { detalhePinoSchema, pinosSchema, type DetalhePino, type ModoMapa, type PinosPagina } from '../domain/pinos';

export async function getPinosPagina(q: { praca_id?: string; mode: ModoMapa; cursor?: string }): Promise<PinosPagina> {
  const { data } = await api.get('/v1/consultores/map/pins', {
    params: { mode: q.mode, ...(q.praca_id ? { praca_id: q.praca_id } : {}), ...(q.cursor ? { cursor: q.cursor } : {}) },
  });
  return pinosSchema.parse(data);
}

export async function getDetalhePino(leadId: string): Promise<DetalhePino> {
  const { data } = await api.get(`/v1/consultores/map/pins/${encodeURIComponent(leadId)}`);
  return detalhePinoSchema.parse(data);
}

/** Mapa do consultor no celular (§34.4, lote E): só os da praça dele que estão num roteiro dele ou que ele visitou. */
export async function getPinosCampoPagina(cursor?: string): Promise<PinosPagina> {
  const { data } = await campoApi.get('/v1/campo/map/pins', { params: { mode: 'resultado', ...(cursor ? { cursor } : {}) } });
  return pinosSchema.parse(data);
}
