import { api } from '@/modules/shared/infrastructure/http';

/**
 * `/v1/msg-templates`, `/v1/settings` e `/v1/blocklist` (§12 do contrato).
 *
 * As métricas de cada modelo (`metrics`) vêm PRONTAS do servidor — no protótipo
 * (`mensagens.ts:184-224`) a tela recontava envio a envio a cada render. O
 * render da prévia (`POST /v1/msg-templates/render`) também é do servidor: é o
 * mesmo código que monta o texto do disparo, então o que se revê na tela é
 * exatamente o que vai sair.
 */

// ── modelos ──────────────────────────────────────────────────
export interface AttachmentView {
  kind: string;
  name: string;
  url: string | null;
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
  winner: string;
}

export interface TemplateView {
  id: string;
  name: string;
  audience: string;
  stage: number;
  channel: string;
  text_a: string;
  /** Sempre string: sem variante B o wire manda `""`, nunca `null`. */
  text_b: string;
  attachment: AttachmentView | null;
  created_at: string;
  metrics: TemplateMetrics;
}

/** Anexo no CORPO: `url` ausente (e não `null`) quando não há link. */
export interface AttachmentBody {
  kind: string;
  name: string;
  url?: string;
}

/** Corpo do POST e do PUT — o PUT substitui o modelo INTEIRO (anexo incluso). */
export interface TemplateBody {
  name: string;
  audience: string;
  stage: number;
  channel: string;
  text_a: string;
  text_b?: string;
  attachment?: AttachmentBody | null;
}

export interface RenderResult {
  text: string;
  /** Variáveis sem valor (ou fora do catálogo) — ficam visíveis como ⟨assim⟩. */
  missing: string[];
}

export async function listTemplates(): Promise<TemplateView[]> {
  const { data } = await api.get('/v1/msg-templates');
  return data as TemplateView[];
}

export async function createTemplate(body: TemplateBody): Promise<TemplateView> {
  const { data } = await api.post('/v1/msg-templates', body);
  return data as TemplateView;
}

export async function replaceTemplate(id: string, body: TemplateBody): Promise<TemplateView> {
  const { data } = await api.put(`/v1/msg-templates/${id}`, body);
  return data as TemplateView;
}

export async function deleteTemplate(id: string): Promise<void> {
  await api.delete(`/v1/msg-templates/${id}`);
}

export async function renderTemplate(input: { text: string; lead_id?: string }): Promise<RenderResult> {
  const { data } = await api.post('/v1/msg-templates/render', input);
  return data as RenderResult;
}

// ── configurações de envio ───────────────────────────────────
export interface TemplateDefaults {
  link_video_caso: string;
  link_cadastro: string;
  funcao: string;
  valor: string;
  dia_forte: string;
  turno: string;
}

export interface SettingsView {
  mode: string;
  window_start: number;
  window_end: number;
  sunday: boolean;
  daily_limit: number;
  gap_min: number;
  gap_max: number;
  daily_quota: number;
  template_defaults: TemplateDefaults;
}

export type UpdateSettingsInput = Partial<Omit<SettingsView, 'template_defaults'>> & {
  template_defaults?: Partial<TemplateDefaults>;
};

export async function fetchSettings(): Promise<SettingsView> {
  const { data } = await api.get('/v1/settings');
  return data as SettingsView;
}

export async function updateSettings(input: UpdateSettingsInput): Promise<SettingsView> {
  const { data } = await api.patch('/v1/settings', input);
  return data as SettingsView;
}

// ── lista de bloqueio ────────────────────────────────────────
export interface BlockView {
  id: string;
  phone: string;
  phone_key: string;
  name: string;
  lead_id: string | null;
  at: string;
  reason: string;
}

export interface CreateBlockInput {
  phone: string;
  name?: string;
  reason?: string;
  lead_id?: string;
}

export async function listBlocklist(): Promise<BlockView[]> {
  const { data } = await api.get('/v1/blocklist');
  return data as BlockView[];
}

export async function addBlock(input: CreateBlockInput): Promise<BlockView> {
  const { data } = await api.post('/v1/blocklist', input);
  return data as BlockView;
}

export async function removeBlock(id: string): Promise<void> {
  await api.delete(`/v1/blocklist/${id}`);
}
