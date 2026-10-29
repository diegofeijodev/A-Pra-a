'use client';

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/modules/shared/infrastructure/http';
import {
  addLeadEvent,
  archiveLead,
  createLead,
  fetchLeadMetrics,
  fetchLeadQueue,
  getLead,
  listLeads,
  listOrphanLeads,
  moveLead,
  setLeadNextStep,
  snoozeLead,
  updateLead,
  type CreateLeadInput,
  type LeadFilters,
  type LeadListView,
  type LeadsMetricsView,
  type LeadView,
  type MoveLeadInput,
  type QueueItemView,
  type QueueView,
  type UpdateLeadInput,
} from '../infrastructure/leads.api';

export type {
  CreateLeadInput,
  LeadFilters,
  LeadListView,
  LeadsMetricsView,
  LeadView,
  MoveLeadInput,
  QueueItemView,
  QueueView,
  UpdateLeadInput,
};

/** Parado = mais de 7 dias sem contato; crítico = mais de 15 (contrato §9). */
export const STALLED_DAYS = 7;
export const CRITICAL_DAYS = 15;

// Mesmas guardas de `api/src/domain/lead-rules.ts:54-59` (e de
// `.prototype/src/lib/praca/funil.ts:71-72`): arquivado e perdido (etapa 8)
// ficam de fora dos dois. `stalled_days` já vem calculado do servidor.
export const isStalled = (lead: LeadListView) =>
  !lead.archived && lead.stage !== 8 && lead.stalled_days > STALLED_DAYS;

export const isCritical = (lead: LeadListView) =>
  !lead.archived && lead.stage !== 8 && lead.stalled_days > CRITICAL_DAYS;

/**
 * Toda escrita num lead mexe em cinco retratos que o servidor calcula: a lista
 * do quadro, a ficha aberta no painel, a fila do dia, as métricas do funil e a
 * lista de órfãos — mais os indicadores (que contam lead por etapa), o sino e
 * os do CRM automático: tarefas, resumo do dia e selos do funil (mesmas chaves
 * de `modules/crm/application/use-crm.ts`, escritas aqui para `leads` não
 * importar `crm`; com a chave desligada essas consultas nem existem e a
 * invalidação não chama nada). Invalidação por PREFIXO porque cada tela monta a
 * lista com um filtro diferente.
 */
function invalidateLead(queryClient: QueryClient) {
  for (const key of [
    ['leads'],
    ['lead'],
    ['lead-queue'],
    ['lead-metrics'],
    ['orphan-leads'],
    ['indicators'],
    ['notifications'],
    ['crm-tasks'],
    ['crm-summary'],
    ['crm-badges'],
  ]) {
    void queryClient.invalidateQueries({ queryKey: key });
  }
}

/**
 * Lista do funil. `enabled` existe porque a praça ativa chega DEPOIS do primeiro
 * render: sem ele, a tela dispara um `GET /v1/leads` sem `praca_id` (a base
 * inteira) antes de saber qual praça filtrar, e só então o pedido certo.
 */
export function useLeads(filters: LeadFilters = {}, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ['leads', filters],
    queryFn: () => listLeads(filters),
    enabled: options.enabled ?? true,
    // Marcar "mostrar arquivados" (ou trocar a praça ativa) muda a chave: sem
    // isto o quadro esvazia e repinta a cada clique no filtro.
    placeholderData: keepPreviousData,
  });
}

export function useLead(id: string | null | undefined) {
  return useQuery({
    queryKey: ['lead', id],
    queryFn: () => getLead(id as string),
    enabled: !!id,
  });
}

/**
 * Fila do dia. `person` é `'all'` ou o id de uma pessoa; `pracaId`, a praça ativa (§9: só a fila dela, sem os de teste). `enabled` pelo
 * mesmo motivo do `useLeads`: a praça ativa chega DEPOIS do primeiro render, e sem ele sairia antes a fila de todas as praças.
 */
export function useLeadQueue(person: string, pracaId?: string | null, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ['lead-queue', person, pracaId ?? null],
    queryFn: () => fetchLeadQueue(person, pracaId),
    enabled: options.enabled ?? true,
    // Trocar de dono muda a chave: sem isto a fila esvazia e repinta.
    placeholderData: keepPreviousData,
  });
}

export function useLeadMetrics(pracaId: string | null | undefined) {
  return useQuery({
    queryKey: ['lead-metrics', pracaId],
    queryFn: () => fetchLeadMetrics(pracaId as string),
    enabled: !!pracaId,
  });
}

export function useOrphanLeads() {
  return useQuery({ queryKey: ['orphan-leads'], queryFn: listOrphanLeads });
}

export function useCreateLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateLeadInput) => createLead(input),
    onSuccess: () => invalidateLead(queryClient),
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível criar o lead.')),
  });
}

export function useUpdateLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateLeadInput }) => updateLead(id, input),
    onSuccess: () => invalidateLead(queryClient),
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível salvar o lead.')),
  });
}

/**
 * Mudança de etapa. O servidor recusa sem próximo passo
 * (`400 NEXT_STEP_REQUIRED`) e sem motivo na etapa 8
 * (`400 LOST_REASON_REQUIRED`) — o diálogo já barra antes, mas a mensagem da
 * API é a que aparece se escapar.
 */
export function useMoveLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: MoveLeadInput }) => moveLead(id, input),
    onSuccess: () => invalidateLead(queryClient),
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível mudar a etapa.')),
  });
}

export function useAddLeadEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, kind, text }: { id: string; kind: string; text: string }) =>
      addLeadEvent(id, kind, text),
    onSuccess: () => invalidateLead(queryClient),
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível registrar o evento.')),
  });
}

export function useSetNextStep() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, what, date }: { id: string; what: string; date: string }) =>
      setLeadNextStep(id, what, date),
    onSuccess: () => invalidateLead(queryClient),
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível salvar o próximo passo.')),
  });
}

export function useArchiveLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => archiveLead(id),
    onSuccess: () => invalidateLead(queryClient),
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível arquivar o lead.')),
  });
}

export function useSnoozeLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, until }: { id: string; until: string }) => snoozeLead(id, until),
    onSuccess: () => invalidateLead(queryClient),
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível adiar o lead.')),
  });
}
