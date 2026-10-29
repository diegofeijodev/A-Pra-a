'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/modules/shared/infrastructure/http';
import { markSend } from '@/modules/disparos/infrastructure/disparos.api';
import { snoozeLead } from '@/modules/leads/infrastructure/leads.api';
import {
  fetchAutomacoes,
  fetchResumoCrm,
  fetchSelosFunil,
  fetchTarefas,
  marcarTarefaFeita,
  type AutomacoesView,
  type TarefaFeitaInput,
  type ResumoCrmView,
  type SelosView,
  type TarefasView,
} from '../infrastructure/crm.api';

export type { AutomacoesView, ResumoCrmView, SelosView, TarefasView };

/**
 * Cada leitura tem `enabled` (a tela passa `features.crm_tasks`): com a chave desligada o servidor responde 404, então nunca
 * se chama `/v1/crm/*` sem ela. O padrão é desligado de propósito.
 */
interface Opcoes {
  enabled?: boolean;
}

/** Releitura das tarefas e do resumo, como o Dashboard (UX §3.1.5). */
const ATUALIZA_A_CADA_MS = 60_000;

/**
 * Tarefas do dia. Relê de 60 em 60 s e ao voltar para a aba (é quando a pessoa volta do WhatsApp; o padrão do projeto desliga isso).
 * `pausado` (linha esperando o "Desfazer" ou menu aberto): a releitura espera, para nada pular debaixo do dedo.
 */
export function useTarefas(
  pracaId: string | null | undefined,
  person: 'all' | 'me',
  { enabled = false, pausado = false }: Opcoes & { pausado?: boolean } = {},
) {
  return useQuery({
    queryKey: ['crm-tasks', pracaId, person],
    queryFn: () => fetchTarefas(pracaId as string, person),
    enabled: enabled && !!pracaId,
    placeholderData: keepPreviousData,
    refetchInterval: pausado ? false : ATUALIZA_A_CADA_MS,
    refetchOnWindowFocus: !pausado,
  });
}

export function useResumoCrm(pracaId: string | null, day: string | undefined, { enabled = false }: Opcoes = {}) {
  return useQuery({
    queryKey: ['crm-summary', pracaId, day ?? null],
    queryFn: () => fetchResumoCrm(pracaId, day),
    enabled,
    placeholderData: keepPreviousData,
    refetchInterval: ATUALIZA_A_CADA_MS,
  });
}

export function useAutomacoes({ enabled = false }: Opcoes = {}) {
  return useQuery({ queryKey: ['crm-automations'], queryFn: fetchAutomacoes, enabled });
}

export function useSelosFunil(pracaId: string | null | undefined, { enabled = false }: Opcoes = {}) {
  return useQuery({
    queryKey: ['crm-badges', pracaId],
    queryFn: () => fetchSelosFunil(pracaId as string),
    enabled: enabled && !!pracaId,
  });
}

/** O que muda com um "Feito"/"Adiar": as tarefas, o resumo, os selos e os retratos do funil (mesmos prefixos de `use-leads`). */
function invalidarCrm(queryClient: ReturnType<typeof useQueryClient>) {
  for (const key of [
    ['crm-tasks'],
    ['crm-summary'],
    ['crm-badges'],
    ['leads'],
    ['lead'],
    ['lead-queue'],
    ['lead-metrics'],
    ['indicators'],
    ['notifications'],
  ]) {
    void queryClient.invalidateQueries({ queryKey: key });
  }
}

/** "Feito" de uma tarefa (`POST /v1/crm/tasks/done`). A `send` usa o "marcar enviada" que já existe (`useMarcarEnviada`). */
export function useFeito() {
  const queryClient = useQueryClient();
  return useMutation({
    // Embrulhado: o TanStack passa um 2º argumento (o contexto) que não é o `opcoes` da API.
    mutationFn: (input: TarefaFeitaInput) => marcarTarefaFeita(input),
    onSuccess: () => invalidarCrm(queryClient),
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível marcar como feito.')),
  });
}

/**
 * "Feito" da T1: o `POST /v1/sends/:id/mark { status: 'enviada' }` de Disparos (`markSend`), mas relendo também as tarefas e o resumo
 * (o `useMarkSend` de Disparos não sabe do CRM).
 */
export function useMarcarEnviada() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sendId: string) => markSend(sendId, 'enviada'),
    onSuccess: () => {
      invalidarCrm(queryClient);
      void queryClient.invalidateQueries({ queryKey: ['disparo'] });
      void queryClient.invalidateQueries({ queryKey: ['disparos'] });
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível marcar a mensagem como enviada.')),
  });
}

/** "Adiar" uma tarefa: reaproveita `POST /v1/leads/:id/snooze { until }`. */
export function useAdiarLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, until }: { id: string; until: string }) => snoozeLead(id, until),
    onSuccess: () => invalidarCrm(queryClient),
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível adiar.')),
  });
}

/**
 * Os mesmos pedidos de "Feito"/"Adiar", para quando a aba fecha com um envio esperando o "Desfazer" (`pagehide`): direto na API e com
 * `keepalive` (o XHR morreria com a página). Sem mutação nem releitura: a página está indo embora.
 */
export const enviosAoFecharAba = {
  marcarEnviada: (sendId: string) => markSend(sendId, 'enviada', { keepalive: true }),
  feito: (input: TarefaFeitaInput) => marcarTarefaFeita(input, { keepalive: true }),
  adiar: (leadId: string, until: string) => snoozeLead(leadId, until, { keepalive: true }),
};
