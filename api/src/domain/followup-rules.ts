/**
 * Retornos (follow-up) pedidos no questionário da visita — contrato §25.4.
 * Funções PURAS: o serviço lê as visitas e o dia de hoje; a decisão de "o que
 * ainda está pendente" mora aqui para a fila nunca ficar cheia de coisa resolvida.
 */
import { daysBetween } from '../common/time/dates';

/** Estágio do lead a partir do qual ele já é cliente cadastrado (não há mais o que retornar). */
export const ESTAGIO_CADASTRADO = 5;

export interface VisitaComRetorno {
  id: string;
  lead_id: string;
  checkin_at: Date;
  checkout_at: Date | null;
  needs_followup: boolean | null;
  followup_date: string | null;
}

/** Vencido = com checkout de verdade, pediu retorno e a data chegou (hoje conta). */
export function retornoVencido(v: VisitaComRetorno, hoje: string): boolean {
  return v.checkout_at !== null && v.needs_followup === true && !!v.followup_date && v.followup_date <= hoje;
}

/**
 * Pendentes entre `candidatas` (visitas com retorno vencido): só vale a visita mais
 * recente do lead — qualquer visita posterior, de qualquer consultor, resolve o retorno.
 * `maisRecente` = check-in da visita mais recente de cada lead (todas as visitas, não só as candidatas).
 */
export function retornosPendentes<T extends VisitaComRetorno>(candidatas: T[], maisRecente: Map<string, Date>, hoje: string): T[] {
  const ultimaPorLead = new Map<string, T>();
  for (const v of candidatas) {
    if (!retornoVencido(v, hoje)) continue;
    const topo = maisRecente.get(v.lead_id);
    if (topo && topo.getTime() > v.checkin_at.getTime()) continue;
    const atual = ultimaPorLead.get(v.lead_id);
    if (!atual || v.checkin_at.getTime() > atual.checkin_at.getTime()) ultimaPorLead.set(v.lead_id, v);
  }
  return [...ultimaPorLead.values()];
}

export interface ClasseRetorno {
  due: 'hoje' | 'atrasado';
  days_late: number;
}

export function classificarRetorno(followupDate: string, hoje: string): ClasseRetorno {
  const atraso = Math.max(daysBetween(followupDate, hoje), 0);
  return { due: atraso === 0 ? 'hoje' : 'atrasado', days_late: atraso };
}

/** No mesmo dia: com hora antes de sem hora; com hora, a mais cedo primeiro (HH:mm ordena como texto). */
export function compararHora(a: string | null | undefined, b: string | null | undefined): number {
  if (a && b) return a < b ? -1 : a > b ? 1 : 0;
  return a ? -1 : b ? 1 : 0;
}

/** Ordem da fila: data mais antiga primeiro; no dia, com hora antes de sem hora (por hora); depois nome e id (determinística). */
export function compararRetornos(
  a: { followup_date: string; followup_time?: string | null; lead_name: string; visit_id: string },
  b: { followup_date: string; followup_time?: string | null; lead_name: string; visit_id: string },
): number {
  return (
    (a.followup_date < b.followup_date ? -1 : a.followup_date > b.followup_date ? 1 : 0) ||
    compararHora(a.followup_time, b.followup_time) ||
    a.lead_name.localeCompare(b.lead_name, 'pt-BR') ||
    (a.visit_id < b.visit_id ? -1 : a.visit_id > b.visit_id ? 1 : 0)
  );
}

/**
 * O lead do retorno pode entrar no roteiro? Precisa de coordenada e de confiança nela:
 * precisão `point|address`, ou o check-in da visita foi no local (`far_from_place = false`).
 */
export function retornoRoteirizavel(lead: { lat: number | null; lng: number | null; location_precision: string | null }, visitaLonge: boolean): boolean {
  if (lead.lat == null || lead.lng == null) return false;
  return lead.location_precision === 'point' || lead.location_precision === 'address' || !visitaLonge;
}
