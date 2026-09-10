'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from './auth.store';

export function useAuth() {
  const { user, hydrated, hydrate, signIn, setUser, signOut } = useAuthStore();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!hydrated) hydrate();
  }, [hydrated, hydrate]);

  return {
    user,
    loading: !hydrated,
    signIn,
    setUser,
    signOut: async () => {
      // Limpa o cache ANTES de trocar de conta — sem isso os dados da conta
      // anterior aparecem por um instante na próxima (bug já visto no web-v2).
      await queryClient.cancelQueries();
      queryClient.clear();
      signOut();
    },
  };
}
