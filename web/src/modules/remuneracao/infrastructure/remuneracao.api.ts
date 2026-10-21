import axios from 'axios';
import { campoApi } from '@/modules/campo/infrastructure/campo-http';
import { api } from '@/modules/shared/infrastructure/http';
import {
  configRespostaSchema,
  type CorpoSimulacao,
  extratoSchema,
  fechamentoSchema,
  ganhosCampoSchema,
  lancamentoSchema,
  simulacaoSchema,
  versaoSchema,
  type ConfigResposta,
  type Extrato,
  type Fechamento,
  type GanhosCampo,
  type Lancamento,
  type RegraRemuneracao,
  type Simulacao,
  type VersaoRegra,
} from '../domain/remuneracao';

const BASE = '/v1/consultores/earnings';

/** `404 EARNINGS_DISABLED`: a flag `FIELD_EARNINGS_ENABLED` está desligada — a UI some em vez de mostrar erro. */
export function remuneracaoDesligada(e: unknown): boolean {
  return axios.isAxiosError(e) && e.response?.status === 404 && e.response.data?.error?.code === 'EARNINGS_DISABLED';
}

export async function getConfigRemuneracao(): Promise<ConfigResposta> {
  const { data } = await api.get(`${BASE}/config`);
  return configRespostaSchema.parse(data);
}

export async function putConfigRemuneracao(body: { valid_from: string; reason?: string; config: RegraRemuneracao }): Promise<VersaoRegra> {
  const { data } = await api.put(`${BASE}/config`, body);
  return versaoSchema.parse(data);
}

export async function simularRemuneracao(body: CorpoSimulacao): Promise<Simulacao> {
  const { data } = await api.post(`${BASE}/simulate`, body);
  return simulacaoSchema.parse(data);
}

export async function getExtrato(q: { week?: string; consultant_id?: string }): Promise<Extrato> {
  const { data } = await api.get(BASE, { params: q });
  return extratoSchema.parse(data);
}

export async function fecharSemana(body: { week_start: string; consultant_id?: string }): Promise<Fechamento> {
  const { data } = await api.post(`${BASE}/close`, body);
  return fechamentoSchema.parse(data);
}

export async function ajustarGanhos(body: { consultant_id: string; amount_cents: number; reason: string; client_id: string }): Promise<Lancamento> {
  const { data } = await api.post(`${BASE}/adjustments`, body);
  return lancamentoSchema.parse(data);
}

export async function estornarAjuste(id: string, body: { reason: string; client_id: string }): Promise<Lancamento> {
  const { data } = await api.post(`${BASE}/adjustments/${encodeURIComponent(id)}/reverse`, body);
  return lancamentoSchema.parse(data);
}

export async function campoGanhos(): Promise<GanhosCampo> {
  const { data } = await campoApi.get('/v1/campo/earnings');
  return ganhosCampoSchema.parse(data);
}
