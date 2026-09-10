'use client';

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/modules/shared/infrastructure/http';
import {
  addBlock,
  createTemplate,
  deleteTemplate,
  listBlocklist,
  listTemplates,
  removeBlock,
  renderTemplate,
  replaceTemplate,
  type AttachmentBody,
  type AttachmentView,
  type BlockView,
  type CreateBlockInput,
  type RenderResult,
  type TemplateBody,
  type TemplateMetrics,
  type TemplateView,
} from '../infrastructure/messages.api';

export type {
  AttachmentBody,
  AttachmentView,
  BlockView,
  CreateBlockInput,
  RenderResult,
  TemplateBody,
  TemplateMetrics,
  TemplateView,
};

/**
 * `useSettings`/`useUpdateSettings` moram em `use-settings.ts` desde a tela de
 * Entrada (a cota do dia sai de `GET /v1/settings`). São reexportados aqui para
 * que a tela de Mensagens tenha um módulo só — a assinatura é a mesma.
 */
export { useSettings, useUpdateSettings } from './use-settings';
export type { SettingsView, UpdateSettingsInput } from './use-settings';

/** Percentual do protótipo (`mensagens.ts:226`): fração 0..1 → "33%". */
export const pct = (n: number) => `${Math.round(n * 100)}%`;

/** Variáveis `{{assim}}` usadas num texto (`mensagens.ts:86-87`). */
export const usedVariables = (text: string): string[] => [
  ...new Set([...text.matchAll(/\{\{\s*([\w_]+)\s*\}\}/g)].map((m) => m[1] as string)),
];

export function useTemplates() {
  return useQuery({ queryKey: ['templates'], queryFn: listTemplates });
}

/**
 * Salvar um modelo mexe em quatro retratos: a lista (as métricas e a ordem saem
 * do servidor), o histórico de disparos (que mostra `template_name`), as
 * cadências (cujos nós apontam para o modelo por id) e a prévia do disparo — o
 * texto das 5 mensagens de exemplo é renderizado a partir do modelo, então sem
 * isso a aba Disparos mostra a prévia antiga. Invalidação por PREFIXO.
 */
function invalidateTemplate(queryClient: QueryClient) {
  for (const key of [['templates'], ['disparos'], ['disparo'], ['disparo-preview'], ['cadences']]) {
    void queryClient.invalidateQueries({ queryKey: key });
  }
}

/** Sem `id` cria (`POST`); com `id` substitui o modelo inteiro (`PUT`). */
export function useSaveTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: TemplateBody }) =>
      id ? replaceTemplate(id, body) : createTemplate(body),
    onSuccess: () => invalidateTemplate(queryClient),
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível salvar o modelo.')),
  });
}

export function useDeleteTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteTemplate(id),
    onSuccess: () => invalidateTemplate(queryClient),
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível excluir o modelo.')),
  });
}

/**
 * Prévia do texto. É MUTATION (e não query) porque o texto é o que está sendo
 * digitado: não há chave estável para guardar em cache, e o `POST /render` não
 * grava nada. Quem chama já vem com debounce (`TemplateEditor`).
 */
export function useRenderTemplate() {
  return useMutation({
    mutationFn: (input: { text: string; lead_id?: string }) => renderTemplate(input),
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível montar a prévia.')),
  });
}

export function useBlocklist() {
  return useQuery({ queryKey: ['blocklist'], queryFn: listBlocklist });
}

/**
 * Bloquear/desbloquear muda quem pode receber: a prévia do disparo (quantos
 * estão na lista de bloqueio) e o painel de um lote (`blocked_after`) envelhecem
 * junto.
 */
function invalidateBlock(queryClient: QueryClient) {
  for (const key of [['blocklist'], ['disparo-preview'], ['disparo']]) {
    void queryClient.invalidateQueries({ queryKey: key });
  }
}

export function useAddBlock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateBlockInput) => addBlock(input),
    onSuccess: () => invalidateBlock(queryClient),
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível bloquear o número.')),
  });
}

export function useRemoveBlock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => removeBlock(id),
    onSuccess: () => invalidateBlock(queryClient),
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível tirar o número da lista.')),
  });
}
