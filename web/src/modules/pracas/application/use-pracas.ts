'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/modules/auth/application/use-auth';
import { useRefreshSession } from '@/modules/auth/application/use-me';
import { apiErrorMessage } from '@/modules/shared/infrastructure/http';
import { useUpdateMe } from '@/modules/users/application/use-users';
import {
  createPraca,
  listPracas,
  recalcDates,
  updatePraca,
  type CreatePracaInput,
  type PracaView,
  type UpdatePracaInput,
} from '../infrastructure/pracas.api';

export type { PracaView };

export function usePracas() {
  return useQuery({ queryKey: ['pracas'], queryFn: listPracas });
}

/**
 * A praça ativa é a de `user.active_praca_id` (guardada no banco, por usuário).
 * Conta recém-criada ainda não tem uma: cai na primeira da lista, como o
 * protótipo fazia com `activePraca()`.
 */
export function useActivePraca(): PracaView | undefined {
  const { user } = useAuth();
  const { data } = usePracas();
  if (!data || data.length === 0) return undefined;
  return data.find((p) => p.id === user?.active_praca_id) ?? data[0];
}

/** Troca a praça ativa da conta logada (`PATCH /v1/users/me`). */
export function useSetActivePraca() {
  const queryClient = useQueryClient();
  const updateMeMutation = useUpdateMe();
  return useMutation({
    mutationFn: (pracaId: string | null) =>
      updateMeMutation.mutateAsync({ active_praca_id: pracaId }),
    // A resposta do `PATCH /v1/users/me` já é o `UserView` novo, e o
    // `useUpdateMe` grava ele na sessão e em `['auth','me']` — não há o que
    // reler aqui, só as praças (portões e estado de etapa mudam com a ativa).
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['pracas'] });
    },
  });
}

export function useCreatePraca() {
  const queryClient = useQueryClient();
  const refreshSession = useRefreshSession();
  return useMutation({
    mutationFn: (input: CreatePracaInput) => createPraca(input),
    onSuccess: async () => {
      // Criar uma praça também grava `active_praca_id` de quem criou (§6), e
      // isso não volta na resposta: a sessão precisa reler o próprio usuário,
      // senão o shell continua apontando para a praça anterior.
      await refreshSession();
      void queryClient.invalidateQueries({ queryKey: ['pracas'] });
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível criar a praça.')),
  });
}

export function useUpdatePraca() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdatePracaInput }) => updatePraca(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pracas'] }),
  });
}

/** Devolve as ações da praça para a data do roteiro (zera adiamentos). */
export function useRecalcDates() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => recalcDates(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['pracas'] });
      void queryClient.invalidateQueries({ queryKey: ['actions'] });
    },
  });
}
