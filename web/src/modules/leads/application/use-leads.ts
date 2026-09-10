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

/** Etapa 8 é "Perdido / reaquecer": não conta como parado. */
export const isStalled = (lead: LeadListView) =>
  lead.stalled_days > STALLED_DAYS && lead.stage !== 8;

export const isCritical = (lead: LeadListView) => lead.stalled_days > CRITICAL_DAYS;

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
