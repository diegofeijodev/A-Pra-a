'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/modules/shared/infrastructure/http';
import {
  createConsultor,
  diaDoConsultor,
  freelaSyncConsultor,
  getCanaisCampo,
  editarRota,
  gerarRotas,
  listRotas,
  getCnaes,
  putCnaes,
  type CnaeItem,
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
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível criar o representante.')),
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

export function useRotas(week: string, pracaId?: string) {
  return useQuery({
    queryKey: [...CHAVE, 'rotas', week, pracaId ?? ''],
    queryFn: () => listRotas({ week, ...(pracaId ? { praca_id: pracaId } : {}) }),
    refetchInterval: 120_000,
  });
}

export function useGerarRotas() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { week: string; consultant_ids?: string[] }) => gerarRotas(input),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: [...CHAVE, 'rotas'] });
      const partes = [`${r.generated} rota(s) gerada(s)`];
      if (r.kept_started) partes.push(`${r.kept_started} dia(s) já iniciado(s) mantido(s)`);
      if (r.sem_localizacao) partes.push(`${r.sem_localizacao} estabelecimento(s) da área ainda sem localização`);
      toast.success(partes.join(' · '));
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível gerar as rotas.')),
  });
}

export function useEditarRota() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, stops }: { id: string; stops: { lead_id: string; removed?: boolean }[] }) => editarRota(id, stops),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [...CHAVE, 'rotas'] });
      toast.success('Rota salva.');
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível salvar a rota.')),
  });
}

export function useCnaes() {
  return useQuery({ queryKey: [...CHAVE, 'cnaes'], queryFn: getCnaes });
}

export function useSalvarCnaes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (cnaes: CnaeItem[]) => putCnaes(cnaes),
    onSuccess: (cnaes) => {
      qc.setQueryData([...CHAVE, 'cnaes'], cnaes);
      toast.success('Lista de CNAEs salva.');
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível salvar os CNAEs.')),
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
