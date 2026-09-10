import { api } from '@/modules/shared/infrastructure/http';
import type { Rec } from '@/lib/recurrence';

/**
 * Roteiro-modelo (§8): as 84 ações-modelo que toda praça nova copia. Leitura
 * para o time todo, escrita só para admin — mexer aqui muda toda praça aberta
 * daqui em diante.
 */
export interface TemplateActionView {
  id: string;
  /** Identidade estável da ação-modelo (o seed faz upsert por ela). */
  key: string;
  step: number;
  title: string;
  owners: string[];
  rec: Rec;
  tools: string[];
  how_to: string[];
  expected: string | null;
  msg: string | null;
  attention: string | null;
  expects_result: boolean;
  sort: number;
}

export interface CreateTemplateActionInput {
  /** `0` = ação fixa (fora das etapas); `1..11` = etapas do roteiro. */
  step: number;
  title: string;
  owners: string[];
  rec: Rec;
}

export interface UpdateTemplateActionInput {
  title?: string;
  owners?: string[];
  rec?: Rec;
}

export async function listTemplateActions(): Promise<TemplateActionView[]> {
  const { data } = await api.get('/v1/template-actions');
  return data as TemplateActionView[];
}

export async function createTemplateAction(
  input: CreateTemplateActionInput,
): Promise<TemplateActionView> {
  const { data } = await api.post('/v1/template-actions', input);
  return data as TemplateActionView;
}

export async function updateTemplateAction(
  id: string,
  input: UpdateTemplateActionInput,
): Promise<TemplateActionView> {
  const { data } = await api.patch(`/v1/template-actions/${id}`, input);
  return data as TemplateActionView;
}

export async function deleteTemplateAction(id: string): Promise<{ ok: boolean }> {
  const { data } = await api.delete(`/v1/template-actions/${id}`);
  return data as { ok: boolean };
}
