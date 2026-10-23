'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/modules/shared/infrastructure/http';
import { SEM_FEATURES_MENU, type FeaturesMenu } from '../domain/acesso';
import { getFeaturesMenu, getListaClientes, getPoliticaSenha, putPoliticaSenha } from '../infrastructure/acesso.api';

const CHAVE_FEATURES = ['lovable', 'features-menu'] as const;

/** Flags do menu e do lote E pela leitura da configuração (200 sempre). `carregando` = ainda não sabe (menu de hoje até lá). */
export function useFeaturesMenu(ligado = true): { features: FeaturesMenu; carregando: boolean } {
  const { data, isPending } = useQuery({ queryKey: CHAVE_FEATURES, queryFn: getFeaturesMenu, staleTime: 5 * 60_000, enabled: ligado });
  return { features: data ?? SEM_FEATURES_MENU, carregando: ligado && isPending };
}

/** Regra de senha nova (§41.2). 200 sempre; o formulário só mostra a regra com `enabled: true`. */
export function usePoliticaSenha(ligado = true) {
  return useQuery({ queryKey: ['senha', 'politica'], queryFn: getPoliticaSenha, staleTime: 5 * 60_000, enabled: ligado });
}

export function useSalvarPoliticaSenha() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: putPoliticaSenha,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['senha', 'politica'] });
      toast.success('Regra de senha salva.');
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível salvar a regra de senha.')),
  });
}

export function useListaClientes(q: { praca_id?: string; codes?: string[]; q?: string; cursor?: string }, ligado: boolean) {
  return useQuery({
    queryKey: ['clientes', 'lista', q.praca_id ?? '', (q.codes ?? []).join(','), q.q ?? '', q.cursor ?? ''],
    queryFn: () => getListaClientes({ ...q, limit: 200 }),
    enabled: ligado,
  });
}
