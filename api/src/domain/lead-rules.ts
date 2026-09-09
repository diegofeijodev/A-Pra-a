/**
 * Regras puras do funil de leads — porta literal de
 * `.prototype/src/lib/praca/funil.ts:56-80`.
 *
 * Diferença de fuso em relação ao protótipo: onde ele fatiava o ISO
 * (`at.slice(0, 10)`, que é o dia UTC), aqui o instante vira dia de Brasília
 * (`todaySp(new Date(at))`). Sem isso um contato das 22h vira "amanhã" e o
 * lead nasce com 1 dia parado a menos — a mesma armadilha que o CLAUDE.md
 * proíbe com `toISOString()`.
 */
import { daysBetween, todaySp } from '../common/time/dates';
import { CONTACT_KINDS, EST_VALUE } from './catalog';

export interface LeadRulesEvent {
  /** Instante ISO do evento. */
  at: string;
  kind: string;
}

/** O mínimo de um lead que as regras precisam ver. */
export interface LeadRules {
  stage: number;
  stage_since: string;
  archived: boolean;
  classe: string;
  last_contact_at: string | null;
  events: LeadRulesEvent[];
}

const CONTATO = CONTACT_KINDS as string[];

/** Dia civil de Brasília de uma data só-dia ("YYYY-MM-DD") ou de um instante ISO. */
const dayOf = (value: string): string => (value.length > 10 ? todaySp(new Date(value)) : value);

/** Última data de contato registrada (não conta mudança de etapa nem nota). */
export function lastContactDate(lead: LeadRules): string | undefined {
  const ev = [...lead.events]
    .filter((e) => CONTATO.includes(e.kind))
    .sort((a, b) => a.at.localeCompare(b.at))
    .pop();
  const at = ev?.at ?? lead.last_contact_at;
  return at ? dayOf(at) : undefined;
}

/** Dias corridos desde a data (999 = nunca, como no protótipo; nunca negativo). */
export const daysSince = (value?: string | null, today: string = todaySp()): number =>
  value ? Math.max(0, daysBetween(dayOf(value), today)) : 999;

/** Dias parado: sem contato registrado, cai para a entrada na etapa. */
export const stalledDays = (lead: LeadRules, today: string = todaySp()): number =>
  daysSince(lastContactDate(lead) ?? lead.stage_since, today);

/** Parado: mais de 7 dias sem toque. Arquivado e perdido (etapa 8) ficam de fora. */
export const isStalled = (lead: LeadRules, today?: string): boolean =>
  !lead.archived && lead.stage !== 8 && stalledDays(lead, today) > 7;

/** Crítico: mais de 15 dias sem toque. */
export const isCritical = (lead: LeadRules, today?: string): boolean =>
  !lead.archived && lead.stage !== 8 && stalledDays(lead, today) > 15;

/** Valor estimado do lead pela classe — classe fora do catálogo vale o piso. */
export const estValue = (classe: string): number =>
  EST_VALUE[classe as keyof typeof EST_VALUE] ?? EST_VALUE.depois;
