import axios from 'axios';
import { campoApi } from '@/modules/campo/infrastructure/campo-http';
import { api } from '@/modules/shared/infrastructure/http';
import {
  chaveSchema,
  detalheSchema,
  gerarSchema,
  listaSchema,
  pagamentosCampoSchema,
  type DetalhePagamento,
  type ListaPagamentos,
  type PagamentosCampo,
  type ResultadoGerar,
} from '../domain/pagamentos';

const BASE = '/v1/consultores/payouts';

/** `404 PAYOUTS_DISABLED`: a flag `FIELD_PAYOUTS_ENABLED` está desligada — a UI some em vez de mostrar erro. */
export function pagamentosDesligados(e: unknown): boolean {
  return axios.isAxiosError(e) && e.response?.status === 404 && e.response.data?.error?.code === 'PAYOUTS_DISABLED';
}

export async function getPagamentos(q: { week?: string; status?: string }): Promise<ListaPagamentos> {
  const { data } = await api.get(BASE, { params: q });
  return listaSchema.parse(data);
}

export async function gerarFila(weekStart: string): Promise<ResultadoGerar> {
  const { data } = await api.post(`${BASE}/generate`, { week_start: weekStart });
  return gerarSchema.parse(data);
}

export async function getDetalhe(id: string): Promise<DetalhePagamento> {
  const { data } = await api.get(`${BASE}/${encodeURIComponent(id)}`);
  return detalheSchema.parse(data);
}

export async function marcarPago(id: string, v: { paid_cents?: number; reason?: string; note?: string; proof?: File | null }): Promise<DetalhePagamento> {
  const form = new FormData();
  if (v.paid_cents !== undefined) form.append('paid_cents', String(v.paid_cents));
  if (v.reason) form.append('reason', v.reason);
  if (v.note) form.append('note', v.note);
  if (v.proof) form.append('proof', v.proof);
  const { data } = await api.post(`${BASE}/${encodeURIComponent(id)}/pay`, form);
  return detalheSchema.parse(data);
}

export async function mudarPagamento(id: string, acao: 'fail' | 'retry' | 'cancel' | 'reverse', reason?: string): Promise<DetalhePagamento> {
  const { data } = await api.post(`${BASE}/${encodeURIComponent(id)}/${acao}`, acao === 'retry' ? {} : { reason });
  return detalheSchema.parse(data);
}

/** A chave completa: só quando o admin pede (copiar). Nunca guardada em cache nem em estado global. */
export async function getChavePix(id: string): Promise<{ pix_key: string; pix_key_type: string }> {
  const { data } = await api.get(`${BASE}/${encodeURIComponent(id)}/pix-key`);
  return chaveSchema.parse(data);
}

async function baixar(url: string, params?: Record<string, string>): Promise<{ blob: Blob; nome: string | null }> {
  const r = await api.get(url, { params, responseType: 'blob' });
  const cd = String(r.headers['content-disposition'] ?? '');
  const nome = /filename="?([^";]+)"?/.exec(cd)?.[1] ?? null;
  return { blob: r.data as Blob, nome };
}

export const baixarCsv = (q: { week: string; include_pix_key: boolean }) =>
  baixar(`${BASE}/export.csv`, { week: q.week, ...(q.include_pix_key ? { include_pix_key: 'true' } : {}) });

export const baixarComprovante = (id: string) => baixar(`${BASE}/${encodeURIComponent(id)}/proof`);

export async function campoPagamentos(): Promise<PagamentosCampo> {
  const { data } = await campoApi.get('/v1/campo/payouts');
  return pagamentosCampoSchema.parse(data);
}

export async function campoComprovante(id: string): Promise<Blob> {
  const r = await campoApi.get(`/v1/campo/payouts/${encodeURIComponent(id)}/proof`, { responseType: 'blob' });
  return r.data as Blob;
}
