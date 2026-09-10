'use client';

import { useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { me } from '../infrastructure/auth.api';
import { useAuthStore } from './auth.store';

/**
 * A conta logada, relida do servidor.
 *
 * A sessão mora no zustand/localStorage, mas o servidor muda o usuário por
 * fora da tela: `POST /v1/pracas` grava `active_praca_id` de quem criou (§6).
 * Sem uma consulta de verdade em `['auth','me']`, invalidar essa chave não
 * fazia nada e a praça ativa da sessão ficava velha.
 *
 * Monte uma vez, no `(app)/layout.tsx`: o que chega aqui é escrito de volta na
 * sessão guardada, então qualquer `invalidateQueries(['auth','me'])` atualiza o
 * shell inteiro.
 */
export function useMe() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);

  const query = useQuery({ queryKey: ['auth', 'me'], queryFn: me, enabled: !!user });

  const fresh = query.data?.user;
  useEffect(() => {
    if (fresh) setUser(fresh);
  }, [fresh, setUser]);

  return query;
}

/**
 * Relê a conta agora e grava na sessão, sem depender de quem montou o `useMe`.
 * Use depois de uma mutação que o servidor aproveita para mexer no usuário.
 */
export function useRefreshSession() {
  const queryClient = useQueryClient();
  const setUser = useAuthStore((s) => s.setUser);

  return useCallback(async () => {
    const { user } = await me();
    setUser(user);
    queryClient.setQueryData(['auth', 'me'], { user });
    return user;
  }, [queryClient, setUser]);
}
