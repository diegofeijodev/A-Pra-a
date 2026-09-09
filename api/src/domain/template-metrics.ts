/**
 * Medição por modelo de mensagem — porta de
 * `.prototype/src/lib/praca/mensagens.ts:184-224`.
 *
 * Função pura: recebe as linhas de `msg_sends` e o recorte dos leads, devolve
 * os números. Quem carrega do banco é o `MessagesService`.
 */
import { daysBetween } from '../common/time/dates';

export interface MetricsSend {
  template_id: string | null;
  lead_id: string;
  variant: string;
  /** `fila` = ainda não saiu; `enviada` | `entregue` | `respondida` já contam. */
  status: string;
  sent_at: string | null;
  stage_at_send: number;
}

export interface MetricsLead {
  stage: number;
  stage_since: string;
}

export interface SideMetrics {
  sent: number;
  responded: number;
  rate: number;
}

export interface TemplateMetrics {
  sent: number;
  responded: number;
  resp_rate: number;
  advanced: number;
  adv_rate: number;
  a: SideMetrics;
  b: SideMetrics;
  winner: 'A' | 'B' | '—';
}

/**
 * "Avançou" = o lead saiu da etapa em que estava quando a mensagem foi enviada
 * e a mudança de etapa está a até 7 dias do envio.
 *
 * Atenção ao sinal: o protótipo usa `diffDays(a, b) = a − b`, então
 * `diffDays(dataDoEnvio, stageSince)` é `envio − stage_since`. Aqui
 * `daysBetween(a, b) = b − a`, então a mesma conta se escreve com os
 * argumentos trocados. Mudar a ordem muda o resultado — não "arrume".
 */
const avancou = (s: MetricsSend, leads: Record<string, MetricsLead>): boolean => {
  const lead = leads[s.lead_id];
  if (!lead || !s.sent_at) return false;
  if (lead.stage <= s.stage_at_send) return false;
  const d = daysBetween(lead.stage_since, s.sent_at.slice(0, 10));
  return d >= 0 && d <= 7;
};

export function templateMetrics(
  tplId: string,
  sends: MetricsSend[],
  leadsById: Record<string, MetricsLead>,
): TemplateMetrics {
  const mine = sends.filter((s) => s.template_id === tplId && s.status !== 'fila');
  const responded = mine.filter((s) => s.status === 'respondida').length;
  const advanced = mine.filter((s) => avancou(s, leadsById)).length;

  const side = (v: 'A' | 'B'): SideMetrics => {
    const list = mine.filter((s) => s.variant === v);
    const r = list.filter((s) => s.status === 'respondida').length;
    return { sent: list.length, responded: r, rate: list.length ? r / list.length : 0 };
  };
  const a = side('A');
  const b = side('B');

  // Amostra pequena não elege nada: 3 de cada lado é o mínimo do protótipo.
  let winner: 'A' | 'B' | '—' = '—';
  if (a.sent >= 3 && b.sent >= 3 && a.rate !== b.rate) winner = a.rate > b.rate ? 'A' : 'B';

  return {
    sent: mine.length,
    responded,
    resp_rate: mine.length ? responded / mine.length : 0,
    advanced,
    adv_rate: mine.length ? advanced / mine.length : 0,
    a,
    b,
    winner,
  };
}
