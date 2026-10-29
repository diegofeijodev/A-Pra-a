/**
 * CRM automático — regras PURAS de etapa (A2, A4 e a guarda do achado 4/5/10 da arquitetura).
 * Sem banco, relógio ou log: "hoje" e o dia do fato chegam por parâmetro ("YYYY-MM-DD", comparação lexicográfica = cronológica).
 */
import { daysBetween } from '../common/time/dates';
import { DIAS_SEM_RESPOSTA } from './catalog/crm';

export type DecisaoEtapa = 'aplicar' | 'ja_satisfeito' | 'ignorar';

const ETAPA_PERDIDO = 8;

/**
 * `auto_stage_applied` = maior alvo que o automático já aplicou ou viu satisfeito. Se ele já cobre o alvo e o lead está abaixo,
 * alguém voltou o cartão: não brigar. Etapa 8 só sai para o alvo se o fato é do dia de entrada em "Perdido" ou depois
 * (perdido marcado DEPOIS do fato = decisão humana mais nova).
 */
export function deveAplicar(
  lead: { stage: number; stage_since: string; archived: boolean; is_test: boolean; auto_stage_applied: number | null },
  alvo: 5 | 6 | 7,
  fatoDia: string,
): DecisaoEtapa {
  if (lead.archived || lead.is_test) return 'ignorar';
  if (lead.stage !== ETAPA_PERDIDO && lead.stage >= alvo) return 'ja_satisfeito';
  if (alvo <= (lead.auto_stage_applied ?? 0)) return 'ignorar';
  if (lead.stage === ETAPA_PERDIDO && fatoDia < lead.stage_since) return 'ignorar';
  return 'aplicar';
}

/** A2: serviço concluído vence (6); senão cadastro confirmado (5); nada = null. */
export function alvoDoCadastro(s: {
  confirmado_em: Date | null;
  first_job_completed_at: Date | null;
}): { alvo: 5 | 6; fato: Date; motivo: 'cadastro' | 'servico' } | null {
  if (s.first_job_completed_at) return { alvo: 6, fato: s.first_job_completed_at, motivo: 'servico' };
  if (s.confirmado_em) return { alvo: 5, fato: s.confirmado_em, motivo: 'cadastro' };
  return null;
}

/**
 * A4: lead SÓ na etapa 2 (Contatado; etapa 1 nunca foi contatada) há `DIAS_SEM_RESPOSTA` dias ou mais NA etapa (`stage_since`) E parado
 * (`stalled_days`, desde o último contato em qualquer etapa) há outros tantos, fora de cadência, sem adiamento nem próximo passo de hoje
 * em diante (hoje conta como futuro). Sem a conta na etapa, um lead com contato antigo arrastado hoje para "Contatado" viraria Perdido
 * amanhã (arquitetura final, achado 2).
 */
export function candidatoSemResposta(
  l: {
    stage: number;
    stage_since: string;
    archived: boolean;
    is_test: boolean;
    snooze_until: string | null;
    next_step_date: string | null;
    stalled_days: number;
    em_cadencia: boolean;
  },
  hoje: string,
): boolean {
  if (l.archived || l.is_test || l.em_cadencia) return false;
  if (l.stage !== 2) return false;
  if (l.snooze_until && l.snooze_until > hoje) return false;
  if (l.next_step_date && l.next_step_date >= hoje) return false;
  if (daysBetween(l.stage_since, hoje) < DIAS_SEM_RESPOSTA) return false;
  return l.stalled_days >= DIAS_SEM_RESPOSTA;
}
