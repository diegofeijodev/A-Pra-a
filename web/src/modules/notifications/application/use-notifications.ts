'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/modules/shared/infrastructure/http';
import {
  dismissNotifications,
  listNotifications,
  type NotifItem,
} from '../infrastructure/notifications.api';

/** Teto de ids por chamada de `POST /v1/notifications/dismiss` (§17). */
const DISMISS_BATCH = 100;

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

/**
 * Dispensa avisos. O "Limpar" do sino manda a lista inteira, e a lista pode
 * passar de 100 (uma praça com muitas ações recorrentes já rende dezenas de
 * `tmw-`): a API rejeita a chamada acima do teto, e sem fatiar o botão
 * simplesmente não fazia nada. As fatias vão em sequência — a dispensa é um
 * upsert idempotente por (usuário, id), então repetir uma fatia não estraga
 * nada se a seguinte falhar.
 */
export function useDismissNotifications() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      for (let i = 0; i < ids.length; i += DISMISS_BATCH) {
        await dismissNotifications(ids.slice(i, i + DISMISS_BATCH));
      }
      return { ok: true };
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível limpar os avisos.')),
    // `onSettled` e não `onSuccess`: mesmo com erro numa fatia do meio, o que
    // já foi dispensado precisa sumir da lista.
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });
}
