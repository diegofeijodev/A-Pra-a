'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/modules/shared/infrastructure/http';
import { getGeo, getMapa, retryGeo } from '../infrastructure/mapa.api';

export function useMapa(pracaId: string | undefined, cnaes: string[]) {
  return useQuery({
    queryKey: ['mapa', pracaId, cnaes.join(',')],
    queryFn: () => getMapa(pracaId!, cnaes),
    enabled: !!pracaId,
  });
}

/** Andamento da geocodificação — atualiza a cada minuto enquanto houver fila. */
export function useGeo(pracaId: string | undefined) {
  return useQuery({
    queryKey: ['mapa', pracaId, 'geo'],
    queryFn: () => getGeo(pracaId!),
    enabled: !!pracaId,
    refetchInterval: (q) => ((q.state.data?.pendente ?? 0) > 0 ? 60_000 : false),
  });
}

export function useRetryGeo(pracaId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => retryGeo(pracaId!),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['mapa', pracaId] });
      toast.success(`${r.requeued} endereço(s) de volta na fila.`);
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível recolocar na fila.')),
  });
}
