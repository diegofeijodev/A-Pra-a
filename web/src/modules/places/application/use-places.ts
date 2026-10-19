'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/modules/shared/infrastructure/http';
import { emAndamento } from '../domain/busca';
import {
  addLeads,
  cancelSearch,
  getSearch,
  listCandidates,
  listSearches,
  listSources,
  startSearch,
  type StartSearchInput,
} from '../infrastructure/places.api';

const POLL_MS = 2000;

export function useSources(enabled = true) {
  return useQuery({ queryKey: ['place-sources'], queryFn: listSources, enabled, staleTime: 60_000 });
}

export function useSearches(pracaId: string | undefined) {
  return useQuery({
    queryKey: ['place-searches', pracaId],
    queryFn: () => listSearches(pracaId!),
    enabled: !!pracaId,
  });
}

/** Consulta a cada 2 s enquanto a busca está na fila ou rodando (o "62 encontrados até agora"). */
export function useSearch(id: string | null, pracaId: string | undefined) {
  return useQuery({
    queryKey: ['place-search', id, pracaId],
    queryFn: () => getSearch(id!, pracaId!),
    enabled: !!id && !!pracaId,
    refetchInterval: (q) => (emAndamento(q.state.data) ? POLL_MS : false),
  });
}

export function useCandidates(id: string | null, pracaId: string | undefined, pronto: boolean) {
  return useQuery({
    queryKey: ['place-candidates', id, pracaId],
    queryFn: () => listCandidates(id!, pracaId!),
    enabled: !!id && !!pracaId && pronto,
  });
}

export function useStartSearch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: StartSearchInput) => startSearch(input),
    onSuccess: (run) => {
      void qc.invalidateQueries({ queryKey: ['place-searches', run.praca_id] });
      void qc.invalidateQueries({ queryKey: ['place-sources'] });
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível iniciar a busca.')),
  });
}

export function useCancelSearch(pracaId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => cancelSearch(id, pracaId!),
    onSuccess: (run) => {
      qc.setQueryData(['place-search', run.id, pracaId], run);
      void qc.invalidateQueries({ queryKey: ['place-searches', pracaId] });
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível cancelar a busca.')),
  });
}

export function useAddLeads(pracaId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ids }: { id: string; ids: string[] }) => addLeads(id, pracaId!, ids),
    onSuccess: (_r, { id }) => {
      void qc.invalidateQueries({ queryKey: ['place-candidates', id, pracaId] });
      // Criou lead: os mesmos retratos do funil envelhecem (igual à importação por arquivo).
      for (const key of [['imports'], ['leads'], ['lead'], ['lead-queue'], ['lead-metrics'], ['orphan-leads'], ['indicators']]) {
        void qc.invalidateQueries({ queryKey: key });
      }
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível adicionar os leads.')),
  });
}
