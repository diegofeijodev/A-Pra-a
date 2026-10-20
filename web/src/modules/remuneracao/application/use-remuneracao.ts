'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/modules/shared/infrastructure/http';
import { useCampoMe } from '@/modules/campo/application/use-campo';
import {
  ajustarGanhos,
  campoGanhos,
  estornarAjuste,
  fecharSemana,
  getConfigRemuneracao,
  getExtrato,
  putConfigRemuneracao,
  remuneracaoDesligada,
  simularRemuneracao,
} from '../infrastructure/remuneracao.api';

const CHAVE = ['remuneracao'] as const;

/** Config da regra. `desligada` = flag fechada no servidor (404): a tela inteira some. */
export function useConfigRemuneracao() {
  const q = useQuery({
    queryKey: [...CHAVE, 'config'],
    queryFn: getConfigRemuneracao,
    retry: (n, e) => !remuneracaoDesligada(e) && n < 1,
    staleTime: 60_000,
  });
  return { ...q, desligada: q.isError && remuneracaoDesligada(q.error) };
}

function useInvalidar() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: CHAVE });
}

export function useSalvarConfigRemuneracao() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: putConfigRemuneracao,
    onSuccess: () => {
      invalidar();
      toast.success('Nova regra salva. Ela vale a partir da data de início; o que já foi fechado não muda.');
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível salvar a regra.')),
  });
}

export const useSimularRemuneracao = () => useMutation({ mutationFn: simularRemuneracao });

export function useExtrato(q: { week?: string; consultant_id?: string }, enabled = true) {
  return useQuery({
    queryKey: [...CHAVE, 'extrato', q.week ?? 'atual', q.consultant_id ?? 'todos'],
    queryFn: () => getExtrato(q),
    enabled,
    retry: (n, e) => !remuneracaoDesligada(e) && n < 1,
  });
}

export function useFecharSemana() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: fecharSemana,
    onSuccess: (r) => {
      invalidar();
      toast.success(r.closed > 0 ? `Semana fechada: ${r.closed} consultor(es).` : 'Esta semana já estava fechada.');
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível fechar a semana.')),
  });
}

export function useAjustarGanhos() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: ajustarGanhos,
    onSuccess: () => {
      invalidar();
      toast.success('Ajuste lançado na semana corrente.');
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível lançar o ajuste.')),
  });
}

export function useEstornarAjuste() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; reason: string; client_id: string }) => estornarAjuste(id, body),
    onSuccess: () => {
      invalidar();
      toast.success('Ajuste estornado.');
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível estornar.')),
  });
}

/** Ganhos do consultor — só busca se o servidor disse que a remuneração está ligada (`features.earnings`). */
export function useGanhosCampo() {
  const me = useCampoMe();
  const ligado = me.data?.features?.earnings === true;
  const q = useQuery({ queryKey: ['campo', 'earnings'], queryFn: campoGanhos, enabled: ligado, refetchInterval: 5 * 60_000, retry: 1 });
  return { ...q, ligado };
}
