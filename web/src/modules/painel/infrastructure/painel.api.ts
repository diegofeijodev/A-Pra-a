import { api } from '@/modules/shared/infrastructure/http';
import { campoApi } from '@/modules/campo/infrastructure/campo-http';
import { configLoteBSchema, type ConfigLoteB } from '../domain/config-lote-b';
import { configLovableSchema, painelSchema, resumoDiaSchema, type ConfigLovable, type ConfigLovableCampos, type PainelView, type ResumoDiaView } from '../domain/painel';

/** `GET /v1/consultores/settings/config` só com as chaves do lote A e `features` (contrato §33.1). */
export async function getConfigLovable(): Promise<ConfigLovable> {
  const { data } = await api.get('/v1/consultores/settings/config');
  return configLovableSchema.parse(data);
}

export async function putConfigLovable(body: Partial<ConfigLovableCampos>): Promise<ConfigLovable> {
  const { data } = await api.put('/v1/consultores/settings/config', body);
  return configLovableSchema.parse(data);
}

export async function getPainel(q: { from: string; to: string; praca_id?: string }): Promise<PainelView> {
  const { data } = await api.get('/v1/consultores/dashboard', { params: { from: q.from, to: q.to, ...(q.praca_id ? { praca_id: q.praca_id } : {}) } });
  return painelSchema.parse(data);
}

export async function getResumoDiaEquipe(consultantId: string, day: string): Promise<ResumoDiaView> {
  const { data } = await api.get(`/v1/consultores/${encodeURIComponent(consultantId)}/days/${encodeURIComponent(day)}/summary`);
  return resumoDiaSchema.parse(data);
}

export async function campoResumoDia(day?: string): Promise<ResumoDiaView> {
  const { data } = await campoApi.get('/v1/campo/day-summary', { params: day ? { day } : {} });
  return resumoDiaSchema.parse(data);
}

/** `GET /v1/consultores/settings/config` com as chaves do lote B (checklist §35.2, intervalo §37.2) e `features`. */
export async function getConfigLoteB(): Promise<ConfigLoteB> {
  const { data } = await api.get('/v1/consultores/settings/config');
  return configLoteBSchema.parse(data);
}

export async function putConfigLoteB(body: Record<string, unknown>): Promise<ConfigLoteB> {
  const { data } = await api.put('/v1/consultores/settings/config', body);
  return configLoteBSchema.parse(data);
}
