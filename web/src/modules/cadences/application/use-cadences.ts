'use client';

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/modules/shared/infrastructure/http';
import {
  createCadence,
  deleteCadence,
  exitEnrollment,
  fetchCadenceStats,
  listCadences,
  listEnrollments,
  replaceCadence,
  restoreSeedCadences,
  runCadenceTest,
  togglePause,
  type CadenceBody,
  type CadenceInsideView,
  type CadenceNodeBody,
  type CadenceNodeView,
  type CadenceStatsView,
  type CadenceStepStatsView,
  type CadenceView,
  type EnrollmentView,
} from '../infrastructure/cadences.api';

export type {
  CadenceBody,
  CadenceInsideView,
  CadenceNodeBody,
  CadenceNodeView,
  CadenceStatsView,
  CadenceStepStatsView,
  CadenceView,
  EnrollmentView,
};

/** Só `msg` e `task` são passos — condição roda junto do passo seguinte (§14). */
export const stepNodes = (c: CadenceView) => c.nodes.filter((n) => n.kind !== 'cond');

/**
 * As inscrições recentes (200), só para o contador do topo ("N pessoas rodando
 * agora"): o painel de cada cadência lê `GET /v1/cadences/:id/stats`, que já
 * traz quem está dentro daquela trilha.
 */
export function useEnrollments(cadenceId?: string) {
  return useQuery({
    queryKey: ['enrollments', cadenceId ?? 'all'],
    queryFn: () => listEnrollments(cadenceId),
  });
}

export function useCadences() {
  return useQuery({ queryKey: ['cadences'], queryFn: listCadences });
}

/**
 * Toda escrita numa cadência muda a lista e o painel de estatísticas (que conta
 * quem está em cada passo). Invalidação por PREFIXO: `['cadence-stats']` cobre
 * a chave de qualquer cadência aberta.
 */
function invalidateCadence(queryClient: QueryClient) {
  for (const key of [['cadences'], ['cadence-stats'], ['enrollments']]) {
    void queryClient.invalidateQueries({ queryKey: key });
  }
}

/** Sem `id` cria (`POST`); com `id` substitui a cadência inteira (`PUT`). */
export function useSaveCadence() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: CadenceBody }) =>
      id ? replaceCadence(id, body) : createCadence(body),
    onSuccess: () => invalidateCadence(queryClient),
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível salvar a cadência.')),
  });
}

export function useDeleteCadence() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteCadence(id),
    onSuccess: () => invalidateCadence(queryClient),
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível apagar a cadência.')),
  });
}

export function useTogglePause() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => togglePause(id),
    onSuccess: () => invalidateCadence(queryClient),
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível pausar a cadência.')),
  });
}

/**
 * "Testar comigo". Quem comprime o tempo (cada dia vira 5 s) e avança os passos
 * é o motor do servidor — a tela só reabre as estatísticas e vê os passos
 * andarem.
 *
 * O teste cria um lead de verdade (`Teste — Cadência`, marcado `is_test`) e o
 * matricula: além das cadências, mexe no que o servidor calcula a partir do
 * lead (o quadro, a ficha e o sino), como manda o `invalidateLead`.
 *
 * `is_test` não é filtrado em lugar nenhum de `leads.service.ts`: o lead de
 * teste aparece na fila do dia, nas métricas do funil e em `leads_novos` — daí
 * `['lead-queue']`, `['lead-metrics']` e `['indicators']` também.
 */
export function useRunTest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, phone }: { id: string; phone: string }) => runCadenceTest(id, phone),
    onSuccess: () => {
      invalidateCadence(queryClient);
      for (const key of [
        ['leads'],
        ['lead'],
        ['notifications'],
        ['lead-queue'],
        ['lead-metrics'],
        ['indicators'],
      ]) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível rodar o teste.')),
  });
}

/**
 * Estatísticas de uma cadência (`entered`, `active`, funil por passo, saídas,
 * quem está dentro). `polling` liga a repergunta de 15 s enquanto o painel do
 * cartão está aberto.
 */
export function useCadenceStats(id: string | null | undefined, options: { polling?: boolean } = {}) {
  return useQuery({
    queryKey: ['cadence-stats', id],
    queryFn: () => fetchCadenceStats(id as string),
    enabled: !!id,
    // Fechado, o cartão só precisa dos três números do cabeçalho: repergunta
    // uma vez e fica quieto. ABERTO, repergunta a cada 15 s — é o compasso do
    // motor, e é assim que o "Testar comigo" mostra os passos avançando.
    refetchInterval: options.polling ? 15_000 : false,
  });
}

export function useExitEnrollment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => exitEnrollment(id, reason),
    onSuccess: () => invalidateCadence(queryClient),
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível tirar a pessoa da cadência.')),
  });
}

/** "Restaurar as 5 cadências prontas" — recria só as que faltam, por nome. */
export function useRestoreSeed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => restoreSeedCadences(),
    onSuccess: () => invalidateCadence(queryClient),
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível restaurar as cadências.')),
  });
}
