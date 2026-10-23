import { api } from '@/modules/shared/infrastructure/http';
import { campoApi } from '@/modules/campo/infrastructure/campo-http';
import {
  campoCupomSchema,
  candidatosSchema,
  configCupomSchema,
  cupomEquipeSchema,
  detalheCupomSchema,
  featuresLoteCSchema,
  listaCuponsSchema,
  type CampoCupom,
  type ConfigCupom,
  type CupomEquipe,
  type DetalheCupom,
  type FeaturesLoteC,
  type ListaCupons,
} from '../domain/cupons';
import { z } from 'zod';

/** `features` do lote C pela leitura da configuração (200 sempre): nunca sonda rota desligada (§38.1). */
export async function getFeaturesLoteC(): Promise<FeaturesLoteC> {
  const { data } = await api.get('/v1/consultores/settings/config');
  return featuresLoteCSchema.parse((data as { features?: unknown })?.features ?? {});
}

// ── equipe (§38.4) ──

export async function listarCupons(q: { situacao?: string; praca_id?: string; q?: string }): Promise<ListaCupons> {
  const params = Object.fromEntries(Object.entries(q).filter(([, v]) => !!v));
  const { data } = await api.get('/v1/consultores/vouchers', { params });
  return listaCuponsSchema.parse(data);
}

export async function detalheCupom(id: string): Promise<DetalheCupom> {
  const { data } = await api.get(`/v1/consultores/vouchers/${encodeURIComponent(id)}`);
  return detalheCupomSchema.parse(data);
}

export async function aprovarCupom(id: string, body: { client_id: string; note?: string | null; contractor_user_id?: string | null; contractor_name?: string | null }): Promise<CupomEquipe> {
  const { data } = await api.post(`/v1/consultores/vouchers/${encodeURIComponent(id)}/approve`, body);
  return cupomEquipeSchema.parse(data);
}

export async function reprovarCupom(id: string, body: { client_id: string; reason: string | null }): Promise<CupomEquipe> {
  const { data } = await api.post(`/v1/consultores/vouchers/${encodeURIComponent(id)}/reject`, body);
  return cupomEquipeSchema.parse(data);
}

export async function candidatosCupom(id: string, q?: string) {
  const { data } = await api.get(`/v1/consultores/vouchers/${encodeURIComponent(id)}/contractor-candidates`, { params: q ? { q } : {} });
  return candidatosSchema.parse(data);
}

export async function vincularCupom(id: string, body: { client_id: string; contractor_user_id: string; contractor_name?: string | null }): Promise<CupomEquipe> {
  const { data } = await api.post(`/v1/consultores/vouchers/${encodeURIComponent(id)}/link-contractor`, body);
  return cupomEquipeSchema.parse(data);
}

export async function tentarCupomDeNovo(id: string): Promise<CupomEquipe> {
  const { data } = await api.post(`/v1/consultores/vouchers/${encodeURIComponent(id)}/coupon/retry`, {});
  return cupomEquipeSchema.parse(data);
}

export async function desativarCupom(id: string, body: { client_id: string; reason: string }): Promise<CupomEquipe> {
  const { data } = await api.post(`/v1/consultores/vouchers/${encodeURIComponent(id)}/coupon/deactivate`, body);
  return cupomEquipeSchema.parse(data);
}

export async function getConfigCupom(): Promise<ConfigCupom> {
  const { data } = await api.get('/v1/consultores/vouchers/config');
  return configCupomSchema.parse(data);
}

export async function putConfigCupom(body: Partial<Omit<ConfigCupom, 'coupons_enabled'>>): Promise<ConfigCupom> {
  const { data } = await api.put('/v1/consultores/vouchers/config', body);
  return configCupomSchema.parse(data);
}

// ── consultor (§38.3) ──

/** Corpo do pedido (também é o item `voucher` da fila offline). */
export interface PedidoCupomPayload {
  client_id: string;
  /** Id ou `client_id` da visita: o servidor acha o estabelecimento (sem sinal, o lugar novo não tem `lead_id` no aparelho). */
  visit_ref: string;
  segment: string;
  freelas_per_week: number;
}

export async function campoPedirCupom(p: PedidoCupomPayload): Promise<CampoCupom> {
  const { data } = await campoApi.post('/v1/campo/vouchers', p);
  return campoCupomSchema.parse(data);
}

export async function campoMeusCupons(): Promise<CampoCupom[]> {
  const { data } = await campoApi.get('/v1/campo/vouchers');
  return z.object({ items: z.array(campoCupomSchema) }).parse(data).items;
}
