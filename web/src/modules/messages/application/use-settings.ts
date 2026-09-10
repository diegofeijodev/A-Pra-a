'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/modules/shared/infrastructure/http';
import {
  fetchSettings,
  updateSettings,
  type SettingsView,
  type UpdateSettingsInput,
} from '../infrastructure/messages.api';

export type { SettingsView, UpdateSettingsInput };

export function useSettings() {
  return useQuery({ queryKey: ['settings'], queryFn: fetchSettings });
}

/**
 * A cota de leads por dia por pessoa (`daily_quota`) corta a fila NO SERVIDOR
 * (§9): mudar o número muda o `GET /v1/leads/queue`, por isso a fila também é
 * invalidada.
 */
export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateSettingsInput) => updateSettings(input),
    onSuccess: (view) => {
      queryClient.setQueryData(['settings'], view);
      void queryClient.invalidateQueries({ queryKey: ['lead-queue'] });
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível salvar os ajustes.')),
  });
}
