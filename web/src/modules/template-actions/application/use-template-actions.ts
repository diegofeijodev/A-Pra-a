'use client';

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/modules/shared/infrastructure/http';
import {
  createTemplateAction,
  deleteTemplateAction,
  listTemplateActions,
  updateTemplateAction,
  type CreateTemplateActionInput,
  type TemplateActionView,
  type UpdateTemplateActionInput,
} from '../infrastructure/template-actions.api';

export type { CreateTemplateActionInput, TemplateActionView, UpdateTemplateActionInput };

/**
 * Roteiro-modelo (§8) — a lista que vira as ações de cada praça nova.
 *
 * A escrita respinga longe: `POST` e `PATCH` não tocam nas praças já abertas,
 * mas a praça criada em seguida nasce com a lista nova, e o `DELETE` só tira do
 * modelo. Como não dá para saber daqui o que o servidor mexeu, a invalidação é
 * por PREFIXO nas quatro fotos que dependem do roteiro: as ações da praça, a
 * agenda (atrasado/hoje/próximos, montada com janelas diferentes em cada tela)
 * e as praças (progresso de etapa).
 */
function invalidateTemplate(queryClient: QueryClient) {
  for (const key of [['template-actions'], ['actions'], ['agenda'], ['pracas']]) {
    void queryClient.invalidateQueries({ queryKey: key });
  }
}

export function useTemplateActions() {
  return useQuery({ queryKey: ['template-actions'], queryFn: listTemplateActions });
}

export function useCreateTemplateAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTemplateActionInput) => createTemplateAction(input),
    onSuccess: () => invalidateTemplate(queryClient),
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível criar a ação-modelo.')),
  });
}

export function useUpdateTemplateAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateTemplateActionInput }) =>
      updateTemplateAction(id, input),
    onSuccess: () => invalidateTemplate(queryClient),
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível salvar a ação-modelo.')),
  });
}

export function useDeleteTemplateAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteTemplateAction(id),
    onSuccess: () => invalidateTemplate(queryClient),
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível apagar a ação-modelo.')),
  });
}
