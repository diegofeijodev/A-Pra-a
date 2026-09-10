'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  dismissNotifications,
  listNotifications,
  type NotifItem,
} from '../infrastructure/notifications.api';

export type { NotifItem };

/**
 * Avisos do sino, de UMA praça. No protótipo eram calculados na tela a cada
 * render; aqui o retrato é do servidor e a lista já vem sem o que esta conta
 * dispensou. Reconsulta a cada minuto — é aviso, não precisa de tempo real.
 */
export function useNotifications(pracaId: string | null | undefined) {
  return useQuery({
    queryKey: ['notifications', pracaId],
    queryFn: () => listNotifications(pracaId as string),
    enabled: !!pracaId,
    refetchInterval: 60_000,
  });
}

export function useDismissNotifications() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => dismissNotifications(ids),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });
}
