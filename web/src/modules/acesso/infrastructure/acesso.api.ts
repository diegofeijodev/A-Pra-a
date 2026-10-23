import { z } from 'zod';
import { api } from '@/modules/shared/infrastructure/http';
import { featuresMenuSchema, type FeaturesMenu } from '../domain/acesso';
import { politicaSchema, type Politica } from '../domain/senha';

/** `features` pela leitura da configuração (200 sempre): o menu e as telas nunca sondam rota desligada. */
export async function getFeaturesMenu(): Promise<FeaturesMenu> {
  const { data } = await api.get('/v1/consultores/settings/config');
  return featuresMenuSchema.parse((data as { features?: unknown })?.features ?? {});
}

/** `GET /v1/password-policy` (público; 200 sempre — desligada = `{ enabled: false }`). */
export async function getPoliticaSenha(): Promise<Politica> {
  const { data } = await api.get('/v1/password-policy');
  return politicaSchema.parse(data);
}

export async function putPoliticaSenha(body: { min_length?: number; require_upper?: boolean; require_digit?: boolean }): Promise<Politica> {
  const { data } = await api.put('/v1/password-policy', body);
  return politicaSchema.parse(data);
}

// ── Clientes > Lista (§34.6) ──
export const itemListaSchema = z.object({
  id: z.string(),
  name: z.string(),
  address: z.string(),
  city: z.string(),
  praca_id: z.string(),
  code: z.string(),
  label: z.string(),
  color: z.string(),
  has_location: z.boolean(),
  phone: z.object({ masked: z.string(), kind: z.enum(['whatsapp', 'fixo']) }).nullable(),
  last_visit: z.object({ day: z.string(), consultant_name: z.string() }).nullable(),
});
export const listaClientesSchema = z.object({
  pracas: z.array(z.object({ id: z.string(), name: z.string() })),
  counts: z.record(z.string(), z.number()),
  total: z.number(),
  without_location: z.number(),
  items: z.array(itemListaSchema),
  next_cursor: z.string().nullable(),
  conta: z.string(),
});
export type ListaClientes = z.infer<typeof listaClientesSchema>;
export type ItemLista = z.infer<typeof itemListaSchema>;

export async function getListaClientes(q: { praca_id?: string; codes?: string[]; q?: string; cursor?: string; limit?: number }): Promise<ListaClientes> {
  const { data } = await api.get('/v1/consultores/map/list', {
    params: {
      ...(q.praca_id ? { praca_id: q.praca_id } : {}),
      ...(q.codes && q.codes.length ? { codes: q.codes.join(',') } : {}),
      ...(q.q && q.q.trim().length >= 2 ? { q: q.q.trim() } : {}),
      ...(q.cursor ? { cursor: q.cursor } : {}),
      ...(q.limit ? { limit: q.limit } : {}),
    },
  });
  return listaClientesSchema.parse(data);
}
