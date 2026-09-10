import { api } from '@/modules/shared/infrastructure/http';
import type { Rec } from '@/lib/recurrence';

export type { Rec };

/** `ActionView` (§7 do contrato). Toda rota de escrita devolve a ação inteira. */
export interface ActionView {
  id: string;
  praca_id: string;
  template_key: string | null;
  step: number;
  title: string;
  owners: string[];
  rec: Rec;
  tools: string[];
  expected: string | null;
  msg: string | null;
  attention: string | null;
  expects_result: boolean;
  due_override: string | null;
  postpone_count: number;
  completed_at: string | null;
  completed_by: string | null;
  result: number | null;
  sort: number;
  completions: Record<string, { by: string; at: string; result: number | null }>;
  comments: { id: string; author_id: string; at: string; text: string }[];
  subitems: { id: string; text: string; done: boolean; sort: number }[];
}

/** Ação avulsa: a API já a cria com `step 0`, `rec once day 0` e `due_override`. */
export interface CreateActionInput {
  praca_id: string;
  title: string;
  owners: string[];
  due_date: string;
}

export async function listActions(pracaId: string): Promise<ActionView[]> {
  const { data } = await api.get('/v1/actions', { params: { praca_id: pracaId } });
  return data as ActionView[];
}

export async function getAction(id: string): Promise<ActionView> {
  const { data } = await api.get(`/v1/actions/${id}`);
  return data as ActionView;
}

export async function createAction(input: CreateActionInput): Promise<ActionView> {
  const { data } = await api.post('/v1/actions', input);
  return data as ActionView;
}

export async function completeAction(
  id: string,
  body: { date?: string; result?: number } = {},
): Promise<ActionView> {
  const { data } = await api.post(`/v1/actions/${id}/complete`, body);
  return data as ActionView;
}

export async function uncompleteAction(
  id: string,
  body: { date?: string } = {},
): Promise<ActionView> {
  const { data } = await api.post(`/v1/actions/${id}/uncomplete`, body);
  return data as ActionView;
}

export async function postponeAction(
  id: string,
  body: { new_date: string; reason: string },
): Promise<ActionView> {
  const { data } = await api.post(`/v1/actions/${id}/postpone`, body);
  return data as ActionView;
}

export async function reassignAction(id: string, userId: string): Promise<ActionView> {
  const { data } = await api.post(`/v1/actions/${id}/reassign`, { user_id: userId });
  return data as ActionView;
}

export async function addComment(id: string, text: string): Promise<ActionView> {
  const { data } = await api.post(`/v1/actions/${id}/comments`, { text });
  return data as ActionView;
}

export async function addSubitem(id: string, text: string): Promise<ActionView> {
  const { data } = await api.post(`/v1/actions/${id}/subitems`, { text });
  return data as ActionView;
}

/**
 * POST sem corpo — e sem `Content-Type`: o Fastify recusa corpo vazio com
 * `application/json` antes de a requisição chegar no Nest (contrato §7). Com
 * `data` ausente o axios não carimba o cabeçalho, então basta não mandar nada.
 */
export async function toggleSubitem(id: string, subitemId: string): Promise<ActionView> {
  const { data } = await api.post(`/v1/actions/${id}/subitems/${subitemId}/toggle`);
  return data as ActionView;
}
