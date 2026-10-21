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
