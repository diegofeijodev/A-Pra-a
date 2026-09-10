'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/modules/shared/infrastructure/http';
import {
  addEntry,
  fetchCanalRows,
  fetchEmpresa,
  fetchPersonRows,
  fetchPracaRows,
  fetchReadings,
  type EmpresaView,
  type IndCanalRowView,
  type IndChange,
  type IndDir,
  type IndHistoryPoint,
  type IndicatorEntryInput,
  type IndicatorEntryView,
  type IndPersonRowView,
  type IndPracaRowView,
  type IndReadingView,
  type MilestoneTargetView,
  type MilestoneView,
  type MonthPoint,
  type PeriodParams,
  type RangeView,
  type ReadingsParams,
  type ReadingsView,
  type Sem,
} from '../infrastructure/indicators.api';

export type {
  EmpresaView,
  IndCanalRowView,
  IndChange,
  IndDir,
  IndHistoryPoint,
  IndicatorEntryInput,
  IndicatorEntryView,
  IndPersonRowView,
  IndPracaRowView,
  IndReadingView,
  MilestoneTargetView,
  MilestoneView,
  MonthPoint,
  PeriodParams,
  RangeView,
  ReadingsParams,
  ReadingsView,
  Sem,
};

/**
 * Indicadores (§16). Toda chave mora sob o prefixo `['indicators']`: trocar de
 * período ou de aba muda a chave, e `keepPreviousData` evita que a tabela
 * esvazie e repinte a cada clique — o mesmo tratamento que a agenda e o funil
 * dão aos seus filtros.
 *
 * O período vira `from`/`to` no SERVIDOR (a janela sai de `todaySp()` em
 * Brasília, nunca do relógio do navegador); `from`/`to` só sobem em
 * `period=livre`, que é onde o contrato os cobra.
 */

export function useIndicators(params: ReadingsParams) {
  const { scope, praca_id, period, from, to } = params;
  return useQuery({
    queryKey: ['indicators', scope, praca_id, period, from, to],
    queryFn: () => fetchReadings(params),
    // Visão de praça sem praça ativa não tem o que pedir (o contrato exige o
    // `praca_id` e recusaria com 400).
    enabled: scope !== 'praca' || !!praca_id,
    placeholderData: keepPreviousData,
  });
}

export function useEmpresa(params: PeriodParams) {
  const { period, from, to } = params;
  return useQuery({
    queryKey: ['indicators', 'empresa', period, from, to],
    queryFn: () => fetchEmpresa(params),
    placeholderData: keepPreviousData,
  });
}

export function usePracaRows(params: PeriodParams) {
  const { period, from, to } = params;
  return useQuery({
    queryKey: ['indicators', 'pracas', period, from, to],
    queryFn: () => fetchPracaRows(params),
    placeholderData: keepPreviousData,
  });
}

export function usePessoaRows(params: PeriodParams) {
  const { period, from, to } = params;
  return useQuery({
    queryKey: ['indicators', 'pessoas', period, from, to],
    queryFn: () => fetchPersonRows(params),
    placeholderData: keepPreviousData,
  });
}

/** A visão canal é sempre de UMA praça — sem ela não há requisição. */
export function useCanalRows(pracaId: string | null | undefined, params: PeriodParams) {
  const { period, from, to } = params;
  return useQuery({
    queryKey: ['indicators', 'canais', pracaId, period, from, to],
    queryFn: () => fetchCanalRows(pracaId as string, params),
    enabled: !!pracaId,
    placeholderData: keepPreviousData,
  });
}

/**
 * Lançamento à mão (upsert por praça + indicador + dia). Invalida o prefixo
 * inteiro porque o número entra em toda visão: a leitura da praça, a junção da
 * empresa e as linhas de praça. O sino também conta indicador velho, daí
 * `['notifications']`.
 */
export function useAddEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ key, input }: { key: string; input: IndicatorEntryInput }) =>
      addEntry(key, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['indicators'] });
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível lançar o número.')),
  });
}
