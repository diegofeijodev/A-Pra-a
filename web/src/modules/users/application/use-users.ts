'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/modules/auth/application/use-auth';
import { apiErrorMessage } from '@/modules/shared/infrastructure/http';
import {
  createUser,
  deactivateUser,
  listUsers,
  setPassword,
  updateMe,
  updateUser,
  type CreateUserInput,
  type UpdateMeInput,
  type UpdateUserInput,
  type UserView,
} from '../infrastructure/users.api';

export type { UserView };

export function useUsers() {
  return useQuery({ queryKey: ['users'], queryFn: listUsers });
}

/**
 * Pessoa pelo id, lida do cache de `['users']` — as telas mostram autor,
 * responsável e cor em toda linha; buscar um a um seria uma requisição por
 * célula.
 */
export function usePerson(id: string | null | undefined): UserView | undefined {
  const { data } = useUsers();
  if (!id) return undefined;
  return data?.find((u) => u.id === id);
}

/**
 * Muda a própria conta (tema, praça ativa, nome…). Além do cache, atualiza a
 * sessão guardada: o tema e a praça ativa são lidos de `user` no shell, e sem
 * isso a tela voltaria ao valor antigo no próximo carregamento.
 *
 * A resposta já é o `UserView` novo, então o `setQueryData(['auth','me'])`
 * mantém o `useMe` montado no layout em dia sem uma volta extra ao servidor.
 * O `onError` existe porque o botão de tema não tem outro lugar para mostrar
 * falha: sem ele, o clique simplesmente não fazia nada visível.
 */
export function useUpdateMe() {
  const queryClient = useQueryClient();
  const { setUser } = useAuth();
  return useMutation({
    mutationFn: (input: UpdateMeInput) => updateMe(input),
    onSuccess: (user) => {
      setUser(user);
      queryClient.setQueryData(['auth', 'me'], { user });
      void queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível salvar a alteração.')),
  });
}

/** `409 EMAIL_IN_USE` é o erro esperado aqui — a mensagem vem da API. */
export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateUserInput) => createUser(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível criar a pessoa.')),
  });
}

/**
 * Muda outra conta (ou a própria, pela tela de Pessoas). Quando a linha
 * editada é a de quem está logado, a resposta é o `UserView` novo da SESSÃO:
 * sem gravá-la, `authStore.user` (e com ele `is_admin`, cor e nome do shell)
 * ficaria velho pelo resto da sessão — `['auth','me']` é montado uma vez só no
 * `(app)/layout.tsx` e não relê sozinho (`refetchOnWindowFocus: false`).
 */
export function useUpdateUser() {
  const queryClient = useQueryClient();
  const { user: sessao, setUser } = useAuth();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateUserInput }) => updateUser(id, input),
    onSuccess: (user) => {
      if (user.id === sessao?.id) {
        setUser(user);
        queryClient.setQueryData(['auth', 'me'], { user });
      }
      void queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível salvar a pessoa.')),
  });
}

export function useSetPassword() {
  return useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) => setPassword(id, password),
    onSuccess: () => toast.success('Senha definida.'),
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível definir a senha.')),
  });
}

/**
 * Desativa a conta (soft delete — a linha fica, com `active: false`). A API
 * recusa o autodesligamento (`CANNOT_DEACTIVATE_SELF`) e a última conta admin
 * ativa (`LAST_ADMIN`): a mensagem dela é o que a tela mostra, sem inventar
 * texto por cima.
 */
export function useDeactivateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deactivateUser(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível desativar a pessoa.')),
  });
}
