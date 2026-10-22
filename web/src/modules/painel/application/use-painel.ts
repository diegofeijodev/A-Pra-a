'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/modules/shared/infrastructure/http';
import { SEM_FEATURES, type ConfigLovableCampos, type FeaturesLovable } from '../domain/painel';
import { campoResumoDia, getConfigLoteB, getConfigLovable, getPainel, getResumoDiaEquipe, putConfigLoteB, putConfigLovable } from '../infrastructure/painel.api';

const CHAVE_CONFIG = ['lovable', 'config'] as const;

export function useConfigLovable() {
  return useQuery({ queryKey: CHAVE_CONFIG, queryFn: getConfigLovable, staleTime: 5 * 60_000 });
}

/** Flags do lote A pela leitura da configuração (200 sempre): nunca sonda rota desligada (404 derrubaria o browser-check). */
export function useFeaturesLovable(): FeaturesLovable {
  const { data } = useConfigLovable();
  return data?.features ?? SEM_FEATURES;
}

export function useSalvarConfigLovable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<ConfigLovableCampos>) => putConfigLovable(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: CHAVE_CONFIG });
      void qc.invalidateQueries({ queryKey: ['rotas'] });
      toast.success('Configuração salva.');
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível salvar a configuração.')),
  });
}

export function usePainel(q: { from: string; to: string; praca_id?: string }, ligado: boolean) {
  return useQuery({ queryKey: ['lovable', 'painel', q.from, q.to, q.praca_id ?? ''], queryFn: () => getPainel(q), enabled: ligado, refetchInterval: 60_000 });
}

export function useResumoDiaEquipe(consultantId: string, day: string, ligado: boolean) {
  return useQuery({ queryKey: ['lovable', 'resumo', consultantId, day], queryFn: () => getResumoDiaEquipe(consultantId, day), enabled: ligado && !!consultantId });
}

export function useResumoDiaCampo(day: string | undefined, ligado: boolean) {
  return useQuery({ queryKey: ['campo', 'resumo', day ?? 'hoje'], queryFn: () => campoResumoDia(day), enabled: ligado, retry: 1 });
}

const CHAVE_CONFIG_B = ['lovable', 'config-b'] as const;

/** Lote B (contrato §35.2, §37.2): checklist e intervalo. Mesma leitura (200 sempre): as seções seguem `features`. */
export function useConfigLoteB() {
  return useQuery({ queryKey: CHAVE_CONFIG_B, queryFn: getConfigLoteB, staleTime: 5 * 60_000 });
}

export function useSalvarConfigLoteB() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => putConfigLoteB(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: CHAVE_CONFIG_B });
      void qc.invalidateQueries({ queryKey: CHAVE_CONFIG });
      void qc.invalidateQueries({ queryKey: ['rotas'] });
      toast.success('Configuração salva.');
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível salvar a configuração.')),
  });
}
