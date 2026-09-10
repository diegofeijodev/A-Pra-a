'use client';

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/modules/shared/infrastructure/http';
import {
  fetchAgenda,
  fetchSteps,
  setStepResult,
  unlockStep,
  type AgendaParams,
  type AgendaView,
  type StepInfoView,
} from '@/modules/pracas/infrastructure/pracas.api';
import {
  addComment,
  addSubitem,
  completeAction,
  createAction,
  getAction,
  listActions,
  postponeAction,
  reassignAction,
  toggleSubitem,
  uncompleteAction,
  type ActionView,
  type CreateActionInput,
} from '../infrastructure/actions.api';

export type { ActionView, AgendaView, StepInfoView };

/**
 * Toda escrita numa ação mexe em quatro retratos que o servidor calcula:
 * a lista da praça, a ação aberta no painel, a agenda (atrasado/hoje/próximos)
 * e as etapas (progresso e portões) — mais o sino, que conta atraso. Invalidar
 * por PREFIXO (`['agenda']`, não `['agenda', pracaId, from, to, person]`)
 * porque cada tela monta a agenda com uma janela diferente.
 */
function invalidateAction(queryClient: QueryClient) {
  for (const key of [['actions'], ['action'], ['agenda'], ['steps'], ['notifications']]) {
    void queryClient.invalidateQueries({ queryKey: key });
  }
}

export function useActions(pracaId: string | null | undefined) {
  return useQuery({
    queryKey: ['actions', pracaId],
    queryFn: () => listActions(pracaId as string),
    enabled: !!pracaId,
  });
}

/**
 * Uma ação só. O painel abre pela lista da praça ativa, mas um aviso do sino
 * (ou um link) pode apontar para uma ação de outra praça, que não está na
 * lista — daí o GET individual.
 */
export function useAction(id: string | null | undefined) {
  return useQuery({
    queryKey: ['action', id],
    queryFn: () => getAction(id as string),
    enabled: !!id,
  });
}

export function useAgenda(pracaId: string | null | undefined, params: AgendaParams) {
  const { from, to, person } = params;
  return useQuery({
    queryKey: ['agenda', pracaId, from, to, person],
    queryFn: () => fetchAgenda(pracaId as string, { from, to, person }),
    enabled: !!pracaId,
    // Trocar de pessoa (ou de mês no calendário) muda a chave: sem isto a tela
    // esvazia e repinta a cada clique no filtro.
    placeholderData: keepPreviousData,
  });
}

export function useSteps(pracaId: string | null | undefined) {
  return useQuery({
    queryKey: ['steps', pracaId],
    queryFn: () => fetchSteps(pracaId as string),
    enabled: !!pracaId,
  });
}

export function useCompleteAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, date, result }: { id: string; date?: string; result?: number }) =>
      completeAction(id, { date, result }),
    onSuccess: () => invalidateAction(queryClient),
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível concluir a ação.')),
  });
}

export function useUncompleteAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, date }: { id: string; date?: string }) => uncompleteAction(id, { date }),
    onSuccess: () => invalidateAction(queryClient),
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível desfazer a conclusão.')),
  });
}

export function usePostponeAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, new_date, reason }: { id: string; new_date: string; reason: string }) =>
      postponeAction(id, { new_date, reason }),
    onSuccess: () => invalidateAction(queryClient),
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível adiar a ação.')),
  });
}

export function useReassignAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, user_id }: { id: string; user_id: string }) => reassignAction(id, user_id),
    onSuccess: () => invalidateAction(queryClient),
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível passar a ação.')),
  });
}

export function useAddComment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) => addComment(id, text),
    onSuccess: () => invalidateAction(queryClient),
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível registrar o comentário.')),
  });
}

export function useAddSubitem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) => addSubitem(id, text),
    onSuccess: () => invalidateAction(queryClient),
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível adicionar o sub-item.')),
  });
}

export function useToggleSubitem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, subitemId }: { id: string; subitemId: string }) =>
      toggleSubitem(id, subitemId),
    onSuccess: () => invalidateAction(queryClient),
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível marcar o sub-item.')),
  });
}

export function useCreateAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateActionInput) => createAction(input),
    onSuccess: () => invalidateAction(queryClient),
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível criar a ação.')),
  });
}

export function useSetStepResult() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ pracaId, n, value }: { pracaId: string; n: number; value: number }) =>
      setStepResult(pracaId, n, value),
    onSuccess: () => {
      invalidateAction(queryClient);
      // O resultado da etapa entra em `PracaView.steps` — a lista de praças
      // também envelhece.
      void queryClient.invalidateQueries({ queryKey: ['pracas'] });
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível lançar o resultado.')),
  });
}

export function useUnlockStep() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ pracaId, n, reason }: { pracaId: string; n: number; reason: string }) =>
      unlockStep(pracaId, n, reason),
    onSuccess: () => {
      invalidateAction(queryClient);
      void queryClient.invalidateQueries({ queryKey: ['pracas'] });
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível destravar a etapa.')),
  });
}
