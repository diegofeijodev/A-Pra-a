import axios from 'axios';
import { z } from 'zod';
import { campoApi } from '@/modules/campo/infrastructure/campo-http';
import { api } from '@/modules/shared/infrastructure/http';
import {
  atribuicaoSchema,
  buscaShoppingSchema,
  candidatoShoppingSchema,
  configDivisaoSchema,
  configShoppingSchema,
  featuresLoteDSchema,
  listaShoppingsSchema,
  minhasRotasSchema,
  planSummarySchema,
  planViewSchema,
  previaSchema,
  shoppingSchema,
  type Atribuicao,
  type BuscaShopping,
  type CandidatoShopping,
  type ConfigDivisao,
  type ConfigShopping,
  type FeaturesLoteD,
  type MinhasRotas,
  type PlanSummary,
  type PlanView,
  type Previa,
  type Shopping,
} from '../domain/planos';

/** `features` do lote D pela leitura da configuração (200 sempre): nunca sonda rota desligada (§39.1, §40.1). */
export async function getFeaturesLoteD(): Promise<FeaturesLoteD> {
  const { data } = await api.get('/v1/consultores/settings/config');
  return featuresLoteDSchema.parse((data as { features?: unknown })?.features ?? {});
}

// ── planos (§39.5) ──

export async function getConfigDivisao(): Promise<ConfigDivisao> {
  const { data } = await api.get('/v1/route-plans/config');
  return configDivisaoSchema.parse(data);
}

export async function putConfigDivisao(body: Partial<ConfigDivisao>): Promise<ConfigDivisao> {
  const { data } = await api.put('/v1/route-plans/config', body);
  return configDivisaoSchema.parse(data);
}

/** `types` (E6, §39.5): os `slug`s do perfil separados por vírgula; vazio = todos (não vai na query). */
export async function getPrevia(p: { praca_id: string; area_id?: string; por_rota?: number; types?: string }): Promise<Previa> {
  const { data } = await api.get('/v1/route-plans/preview', { params: Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined && v !== '')) });
  return previaSchema.parse(data);
}

export async function listarPlanos(praca_id: string, kind = 'geral'): Promise<PlanSummary[]> {
  const { data } = await api.get('/v1/route-plans', { params: { praca_id, kind } });
  return z.array(planSummarySchema).parse(data);
}

export async function getPlano(id: string): Promise<PlanView> {
  const { data } = await api.get(`/v1/route-plans/${encodeURIComponent(id)}`);
  return planViewSchema.parse(data);
}

export interface CriarPlanoInput {
  praca_id: string;
  area_id?: string;
  kind?: 'geral' | 'shoppings' | 'shopping_interno';
  parent_lead_id?: string;
  por_rota?: number;
  travel_mode?: 'carro' | 'a_pe';
  /** "Perfil dos clientes" (E6, §39.4): só no plano geral sem `lead_ids`; ausente = todos. */
  types?: string[];
}

export async function criarPlano(body: CriarPlanoInput): Promise<PlanView> {
  const { data } = await api.post('/v1/route-plans', body);
  return planViewSchema.parse(data);
}

export async function atribuirItem(planId: string, itemId: string, body: { consultant_id: string; day: string; confirm_replace?: boolean }): Promise<Atribuicao> {
  const { data } = await api.post(`/v1/route-plans/${encodeURIComponent(planId)}/items/${encodeURIComponent(itemId)}/assign`, body);
  return atribuicaoSchema.parse(data);
}

export async function arquivarPlano(id: string): Promise<PlanView> {
  const { data } = await api.post(`/v1/route-plans/${encodeURIComponent(id)}/archive`);
  return planViewSchema.parse(data);
}

// ── consultor (§39.7) ──

export async function campoMinhasRotas(from: string, to: string): Promise<MinhasRotas> {
  const { data } = await campoApi.get('/v1/campo/routes', { params: { from, to } });
  return minhasRotasSchema.parse(data);
}

// ── shoppings (§40) ──

export async function getConfigShopping(): Promise<ConfigShopping> {
  const { data } = await api.get('/v1/consultores/shoppings/config');
  return configShoppingSchema.parse(data);
}

export async function putConfigShopping(body: Partial<ConfigShopping>): Promise<ConfigShopping> {
  const { data } = await api.put('/v1/consultores/shoppings/config', body);
  return configShoppingSchema.parse(data);
}

export async function listarShoppings(praca_id: string): Promise<{ config: ConfigShopping; shoppings: Shopping[] }> {
  const { data } = await api.get('/v1/consultores/shoppings', { params: { praca_id } });
  return listaShoppingsSchema.parse(data);
}

export async function marcarShopping(leadId: string, large_override: boolean | null): Promise<Shopping> {
  const { data } = await api.patch(`/v1/consultores/shoppings/${encodeURIComponent(leadId)}`, { large_override });
  return shoppingSchema.parse(data);
}

export async function buscarShoppings(body: { praca_id: string; kind: 'shoppings' | 'lojas'; parent_lead_id?: string; types?: string[]; radius_m?: number }): Promise<BuscaShopping> {
  const { data } = await api.post('/v1/place-searches', body);
  return buscaShoppingSchema.parse(data);
}

export async function getBuscaShopping(id: string, praca_id: string): Promise<BuscaShopping> {
  const { data } = await api.get(`/v1/place-searches/${encodeURIComponent(id)}`, { params: { praca_id } });
  return buscaShoppingSchema.parse(data);
}

export async function candidatosShopping(id: string, praca_id: string): Promise<CandidatoShopping[]> {
  const { data } = await api.get(`/v1/place-searches/${encodeURIComponent(id)}/candidates`, { params: { praca_id } });
  return z.array(candidatoShoppingSchema).parse(data);
}

export async function adicionarAchados(id: string, praca_id: string, candidate_ids: string[]): Promise<{ created: number }> {
  const { data } = await api.post(`/v1/place-searches/${encodeURIComponent(id)}/leads`, { praca_id, candidate_ids });
  return z.object({ created: z.number() }).parse(data);
}

/** Código do erro da API (`{ error: { code } }`), para escolher o que a tela oferece (ex.: `ROUTE_EXISTS`). */
export function codigoDoErro(e: unknown): string | null {
  if (!axios.isAxiosError(e)) return null;
  const code = (e.response?.data as { error?: { code?: unknown } } | undefined)?.error?.code;
  return typeof code === 'string' ? code : null;
}
