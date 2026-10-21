import axios from 'axios';
import { api } from '@/modules/shared/infrastructure/http';
import { linhaSchema, relatorioSchema, type LinhaDeclaracao, type RelatorioDeclarados } from '../domain/declarados';

const BASE = '/v1/consultores/declared-signups';

/** `404 DECLARED_DISABLED`: a flag `FIELD_DECLARED_SIGNUPS_ENABLED` está desligada — a UI some em vez de mostrar erro. */
export function declaradosDesligados(e: unknown): boolean {
  return axios.isAxiosError(e) && e.response?.status === 404 && e.response.data?.error?.code === 'DECLARED_DISABLED';
}

export async function getDeclarados(q: { from?: string; to?: string; status?: string; consultant_id?: string }): Promise<RelatorioDeclarados> {
  const params = Object.fromEntries(Object.entries(q).filter(([, v]) => v));
  const { data } = await api.get(BASE, { params });
  return relatorioSchema.parse(data);
}

export async function anularDeclaracao(id: string, body: { reason: string; note: string; client_id: string }): Promise<LinhaDeclaracao> {
  const { data } = await api.post(`${BASE}/${encodeURIComponent(id)}/void`, body);
  return linhaSchema.parse(data);
}
