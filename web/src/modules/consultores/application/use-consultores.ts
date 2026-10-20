'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/modules/shared/infrastructure/http';
import type { ConfigAlertas } from '../domain/atencao';
import {
  createConsultor,
  diaDoConsultor,
  freelaSyncConsultor,
  getAtencao,
  getConfigAlertas,
  getRetornosEquipe,
  putConfigAlertas,
  getCanaisCampo,
  getConsultor,
  listConsultores,
  putCanaisCampo,
  resetSenhaConsultor,
  updateConsultor,
  type CreateConsultorInput,
  type UpdateConsultorInput,
} from '../infrastructure/consultores.api';

const CHAVE = ['consultores'] as const;

/** Lista com a situação de hoje — atualiza a cada minuto (acompanhamento em tempo quase real). */
export function useConsultores() {
  return useQuery({ queryKey: CHAVE, queryFn: listConsultores, refetchInterval: 60_000 });
}

export function useConsultor(id: string) {
  return useQuery({ queryKey: [...CHAVE, id], queryFn: () => getConsultor(id) });
}

export function useDiaConsultor(id: string, day: string) {
  return useQuery({ queryKey: [...CHAVE, id, 'dia', day], queryFn: () => diaDoConsultor(id, day), refetchInterval: 60_000 });
}

function useInvalidar() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: CHAVE });
}

export function useCreateConsultor() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (input: CreateConsultorInput) => createConsultor(input),
    onSuccess: invalidar,
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível criar o consultor.')),
  });
}

export function useUpdateConsultor(id: string) {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (input: UpdateConsultorInput) => updateConsultor(id, input),
    onSuccess: invalidar,
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível salvar.')),
  });
}

export function useResetSenhaConsultor(id: string) {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: () => resetSenhaConsultor(id),
    onSuccess: invalidar,
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível gerar a senha.')),
  });
}

export function useFreelaSyncConsultor(id: string) {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: () => freelaSyncConsultor(id),
    onSuccess: (c) => {
      invalidar();
      if (c.freela_sync_error) toast.error(`Freela: ${c.freela_sync_error}`);
      else toast.success('Código no Freela pronto.');
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível falar com o Freela.')),
  });
}

export function useCanaisCampo() {
  return useQuery({ queryKey: [...CHAVE, 'canais'], queryFn: getCanaisCampo });
}

export function useSalvarCanaisCampo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (channels: string[]) => putCanaisCampo(channels),
    onSuccess: (channels) => {
      qc.setQueryData([...CHAVE, 'canais'], channels);
      toast.success('Lista salva.');
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível salvar a lista.')),
  });
}

/** "Atenção agora" e meta do dia — o recálculo é no servidor; a tela só consulta de 60 em 60 s. */
export function useAtencao() {
  return useQuery({ queryKey: [...CHAVE, 'atencao'], queryFn: () => getAtencao(), refetchInterval: 60_000 });
}

export function useRetornosEquipe() {
  return useQuery({ queryKey: [...CHAVE, 'retornos'], queryFn: () => getRetornosEquipe(), refetchInterval: 60_000 });
}

export function useConfigAlertas() {
  return useQuery({ queryKey: [...CHAVE, 'config-alertas'], queryFn: getConfigAlertas });
}

export function useSalvarConfigAlertas() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<ConfigAlertas>) => putConfigAlertas(body),
    onSuccess: (c) => {
      qc.setQueryData([...CHAVE, 'config-alertas'], c);
      void qc.invalidateQueries({ queryKey: [...CHAVE, 'atencao'] });
      toast.success('Limites dos alertas salvos.');
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível salvar os limites.')),
  });
}
