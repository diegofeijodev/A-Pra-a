'use client';

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/modules/shared/infrastructure/http';
import {
  deleteMapping,
  evaluateImport,
  listImports,
  listMappings,
  runImport,
  saveMapping,
  undoImport,
  type DupAction,
  type EvaluateImportInput,
  type EvaluateView,
  type EvalRowView,
  type ImportBatchView,
  type ImportMappingView,
  type OwnerMode,
  type PracaMode,
  type RunImportInput,
  type RunView,
} from '../infrastructure/imports.api';

export type {
  DupAction,
  EvaluateImportInput,
  EvaluateView,
  EvalRowView,
  ImportBatchView,
  ImportMappingView,
  OwnerMode,
  PracaMode,
  RunImportInput,
  RunView,
};

/** Importar cria e completa lead: os mesmos retratos do funil envelhecem. */
function invalidateImport(queryClient: QueryClient) {
  for (const key of [
    ['imports'],
    ['leads'],
    ['lead'],
    ['lead-queue'],
    ['lead-metrics'],
    ['orphan-leads'],
    ['indicators'],
    ['notifications'],
  ]) {
    void queryClient.invalidateQueries({ queryKey: key });
  }
}

export function useMappings() {
  return useQuery({ queryKey: ['import-mappings'], queryFn: listMappings });
}

export function useSaveMapping() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name, map }: { name: string; map: Record<string, string> }) =>
      saveMapping(name, map),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['import-mappings'] }),
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível salvar o mapeamento.')),
  });
}

export function useDeleteMapping() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteMapping(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['import-mappings'] }),
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível excluir o mapeamento.')),
  });
}

/**
 * Avaliação é MUTAÇÃO, não consulta: o corpo carrega o arquivo inteiro (até
 * 5.000 linhas) e a resposta depende da base viva. Guardar isso em cache por
 * chave seria guardar megabytes de planilha — a tela chama a cada mudança de
 * mapeamento (com espera de 300 ms) e usa o último resultado.
 */
export function useEvaluateImport() {
  return useMutation({
    mutationFn: (input: EvaluateImportInput) => evaluateImport(input),
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível avaliar o arquivo.')),
  });
}

export function useRunImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RunImportInput) => runImport(input),
    onSuccess: () => invalidateImport(queryClient),
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível importar o arquivo.')),
  });
}

export function useImports() {
  return useQuery({ queryKey: ['imports'], queryFn: listImports });
}

export function useUndoImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => undoImport(id),
    onSuccess: () => invalidateImport(queryClient),
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível desfazer a importação.')),
  });
}
