import { api } from '@/modules/shared/infrastructure/http';

/**
 * `/v1/cadences` e `/v1/enrollments` (§14 do contrato).
 *
 * O RELÓGIO da cadência é do servidor (`@Cron` a cada 15 s) — desvio §19.1: no
 * protótipo o motor só andava com a aba de Mensagens aberta, e a tela chamava
 * `tick()` num `setInterval`. Aqui a tela só lê o que o motor já fez.
 */

export interface CadenceNodeView {
  id: string;
  sort: number;
  kind: string;
  day: number;
  channel: string | null;
  template_id: string | null;
  text: string | null;
  task: string | null;
  rule: string | null;
  action: string | null;
  note: string | null;
}

export interface CadenceView {
  id: string;
  name: string;
  audience: string;
  entry: string;
  exit: { action: string; note: string };
  paused: boolean;
  created_at: string;
  nodes: CadenceNodeView[];
}

/** Nó como o corpo aceita: `id` só faz sentido no `PUT` (mantém o log de quem está dentro). */
export interface CadenceNodeBody {
  id?: string;
  kind: string;
  day?: number;
  channel?: string;
  template_id?: string;
  text?: string;
  task?: string;
  rule?: string;
  action?: string;
  note?: string;
}

export interface CadenceBody {
  name: string;
  audience: string;
  entry: string;
  exit: { action: string; note: string };
  paused?: boolean;
  nodes: CadenceNodeBody[];
}

export interface CadenceStepStatsView {
  node: CadenceNodeView;
  here: number;
  reached: number;
  replied: number;
  resp_rate: number;
}

export interface CadenceInsideView {
  enrollment_id: string;
  lead_id: string;
  lead_name: string;
  status: string;
  step_index: number;
  next_at: string;
}

export interface CadenceStatsView {
  entered: number;
  active: number;
  per_step: CadenceStepStatsView[];
  exits: { reason: string; count: number }[];
  advanced: number;
  inside: CadenceInsideView[];
}

export interface EnrollmentLogView {
  node_id: string;
  at: string;
  send_id: string | null;
  kind: string;
}

export interface EnrollmentView {
  id: string;
  cadence_id: string;
  lead_id: string;
  started_at: string;
  next_at: string;
  status: string;
  exit_reason: string | null;
  stage_at_start: number;
  is_test: boolean;
  logs: EnrollmentLogView[];
}

export async function listCadences(): Promise<CadenceView[]> {
  const { data } = await api.get('/v1/cadences');
  return data as CadenceView[];
}

export async function createCadence(body: CadenceBody): Promise<CadenceView> {
  const { data } = await api.post('/v1/cadences', body);
  return data as CadenceView;
}

export async function replaceCadence(id: string, body: CadenceBody): Promise<CadenceView> {
  const { data } = await api.put(`/v1/cadences/${id}`, body);
  return data as CadenceView;
}

export async function deleteCadence(id: string): Promise<void> {
  await api.delete(`/v1/cadences/${id}`);
}

export async function togglePause(id: string): Promise<CadenceView> {
  const { data } = await api.post(`/v1/cadences/${id}/toggle-pause`);
  return data as CadenceView;
}

export async function fetchCadenceStats(id: string): Promise<CadenceStatsView> {
  const { data } = await api.get(`/v1/cadences/${id}/stats`);
  return data as CadenceStatsView;
}

export async function enrollLead(id: string, leadId: string): Promise<{ ok: boolean; waiting: boolean }> {
  const { data } = await api.post(`/v1/cadences/${id}/enroll`, { lead_id: leadId });
  return data as { ok: boolean; waiting: boolean };
}

/** "Testar comigo": cada dia da cadência vira 5 segundos, no seu próprio número. */
export async function runCadenceTest(
  id: string,
  phone: string,
): Promise<{ enrollment_id: string; lead_id: string }> {
  const { data } = await api.post(`/v1/cadences/${id}/test`, { phone });
  return data as { enrollment_id: string; lead_id: string };
}

export async function restoreSeedCadences(): Promise<{ created: number }> {
  const { data } = await api.post('/v1/cadences/restore-seed');
  return data as { created: number };
}

/** As 200 inscrições mais recentes; `cadence_id` filtra uma cadência só. */
export async function listEnrollments(cadenceId?: string): Promise<EnrollmentView[]> {
  const { data } = await api.get('/v1/enrollments', {
    params: cadenceId ? { cadence_id: cadenceId } : undefined,
  });
  return data as EnrollmentView[];
}

export async function exitEnrollment(id: string, reason?: string): Promise<EnrollmentView> {
  const { data } = await api.post(`/v1/enrollments/${id}/exit`, reason ? { reason } : {});
  return data as EnrollmentView;
}
