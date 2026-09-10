'use client';

import { useQuery } from '@tanstack/react-query';
import {
  getLead,
  listLeads,
  type LeadFilters,
  type LeadListView,
  type LeadView,
} from '../infrastructure/leads.api';

export type { LeadFilters, LeadListView, LeadView };

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
 * Leitura do funil. A Task 20 acrescenta as mutações (mover, arquivar, evento,
 * próximo passo) e as visões de fila e métricas.
 */
export function useLeads(filters: LeadFilters = {}) {
  return useQuery({ queryKey: ['leads', filters], queryFn: () => listLeads(filters) });
}

export function useLead(id: string | null | undefined) {
  return useQuery({
    queryKey: ['lead', id],
    queryFn: () => getLead(id as string),
    enabled: !!id,
  });
}
