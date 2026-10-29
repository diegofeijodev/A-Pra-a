import { z } from 'zod';
import { api } from '@/modules/shared/infrastructure/http';

/**
 * CRM automático (contrato §47.3), validado na borda da rede. Só se chama com `features.crm_tasks` ligada: desligada, o servidor
 * responde 404 `CRM_TASKS_DISABLED` e a tela nem monta (nunca sondar por 404).
 */

export const TIPOS_TAREFA = ['send', 'cadence_send', 'hot_visit', 'next_step', 'stalled', 'first_vacancy'] as const;
export type TipoTarefa = (typeof TIPOS_TAREFA)[number];
/** Tarefas que o "Feito" fecha por `POST /v1/crm/tasks/done` (a `send` usa `/v1/sends/:id/mark`; a `cadence_send` é só leitura). */
export type TarefaFeita = 'hot_visit' | 'next_step' | 'stalled' | 'first_vacancy';
export type ContatoFeito = 'call' | 'msg_out' | 'msg_in' | 'visit';

export const itemTarefaSchema = z.object({
  lead_id: z.string(),
  lead_name: z.string(),
  owner_id: z.string().nullable(),
  stage: z.number(),
  phone: z.string().nullable(),
  send_id: z.string().optional(),
  text: z.string().optional(),
  scheduled_at: z.string().optional(),
  origin_label: z.string().optional(),
  visit: z.object({ consultant_name: z.string(), day: z.string(), interest: z.string() }).optional(),
  next_step: z.object({ what: z.string().nullable(), date: z.string(), from_cadence: z.boolean() }).optional(),
  last_contact_day: z.string().optional(),
  stage_since: z.string().optional(),
  readonly: z.boolean().optional(),
});
export type ItemTarefaView = z.infer<typeof itemTarefaSchema>;

export const tarefasViewSchema = z.object({
  day: z.string(),
  praca_id: z.string(),
  person: z.enum(['all', 'me']),
  counts: z.object({ me: z.number(), all: z.number() }),
  entrada: z.object({ novos: z.number() }),
  freela_configured: z.boolean(),
  groups: z.array(
    z.object({
      task: z.enum(TIPOS_TAREFA),
      total: z.number(),
      items: z.array(itemTarefaSchema),
    }),
  ),
});
export type TarefasView = z.infer<typeof tarefasViewSchema>;

export const resumoCrmViewSchema = z.object({
  day: z.string(),
  praca_id: z.string().nullable(),
  freela_configured: z.boolean(),
  freela_read_at: z.string().nullable(),
  numbers: z.array(
    z.object({
      key: z.string(),
      /** `null` = não dá para contar (ex.: números do Freela sem a conta configurada). */
      value: z.number().nullable(),
      parts: z.array(z.object({ label: z.string(), value: z.number() })),
      formula: z.string(),
      source: z.string(),
    }),
  ),
});
export type ResumoCrmView = z.infer<typeof resumoCrmViewSchema>;

export const automacoesViewSchema = z.object({
  freela_configured: z.boolean(),
  send_mode: z.string(),
  jobs: z.array(
    z.object({
      key: z.string(),
      enabled: z.boolean(),
      needs_freela: z.boolean(),
      blocked_by: z.enum(['freela', 'signup_sync']).nullable(),
      last_run: z.object({ at: z.string(), ok: z.boolean(), summary: z.unknown(), error: z.string().optional() }).nullable(),
      last_7d: z.record(z.string(), z.number()),
    }),
  ),
  cadences: z.array(z.object({ id: z.string(), name: z.string(), entry: z.string(), paused: z.boolean(), active_enrollments: z.number() })),
  warnings: z.array(z.string()),
});
export type AutomacoesView = z.infer<typeof automacoesViewSchema>;

export const selosViewSchema = z.object({
  items: z.array(z.object({ lead_id: z.string(), last_stage_auto: z.boolean(), freela_hirings: z.number().nullable() })),
});
export type SelosView = z.infer<typeof selosViewSchema>;

export interface TarefaFeitaInput {
  lead_id: string;
  task: TarefaFeita;
  kind: ContatoFeito;
  text?: string;
  next_step?: { what: string; date: string };
}

export async function fetchTarefas(pracaId: string, person: 'all' | 'me'): Promise<TarefasView> {
  const { data } = await api.get('/v1/crm/tasks', { params: { praca_id: pracaId, person } });
  return tarefasViewSchema.parse(data);
}

export async function marcarTarefaFeita(input: TarefaFeitaInput): Promise<{ ok: true; lead_id: string }> {
  const { data } = await api.post('/v1/crm/tasks/done', input);
  return z.object({ ok: z.literal(true), lead_id: z.string() }).parse(data);
}

/** `pracaId` ausente = todas as praças; `day` ausente = hoje (o servidor decide). */
export async function fetchResumoCrm(pracaId: string | null, day?: string): Promise<ResumoCrmView> {
  const params: Record<string, string> = {};
  if (pracaId) params.praca_id = pracaId;
  if (day) params.day = day;
  const { data } = await api.get('/v1/crm/summary', { params });
  return resumoCrmViewSchema.parse(data);
}

export async function fetchAutomacoes(): Promise<AutomacoesView> {
  const { data } = await api.get('/v1/crm/automations');
  return automacoesViewSchema.parse(data);
}

export async function fetchSelosFunil(pracaId: string): Promise<SelosView> {
  const { data } = await api.get('/v1/crm/badges', { params: { praca_id: pracaId } });
  return selosViewSchema.parse(data);
}
