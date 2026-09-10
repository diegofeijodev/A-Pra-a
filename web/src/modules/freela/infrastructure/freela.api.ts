import { api } from '@/modules/shared/infrastructure/http';
import type { DisparoFilters } from '@/modules/disparos/infrastructure/disparos.api';

/**
 * `/v1/freela/*` (§18 do contrato) — a ponte com o sistema de campanhas do
 * Freela (api-freela).
 *
 * Duas direções de wire convivem aqui, e é de propósito (§18.2):
 *
 * - o que a tela **manda** é snake_case, como todo o resto do Praça (o serviço
 *   traduz para o camelCase do Freela num lugar só);
 * - o que a tela **lê** de leituras que só repassam o Freela (o corpo de
 *   `GET /campaigns/:id`, os destinatários e as campanhas automáticas) vem em
 *   **camelCase**, como veio de lá, com `praca_id` a mais. Espelhar campo a
 *   campo criaria uma segunda definição para manter sincronizada a cada mudança
 *   do Freela.
 *
 * Sem `FREELA_API_URL`/`FREELA_ADMIN_EMAIL`/`FREELA_ADMIN_PASSWORD` na API,
 * TODAS estas rotas menos `GET /status` respondem `503 FREELA_NOT_CONFIGURED`
 * — por isso os hooks só as chamam com `status.configured` (§ `use-freela.ts`).
 */

// ── conjuntos fechados (os mesmos do Freela, §18.2) ───────────
/** Os quatro públicos internos: parados ou que nunca usaram. */
export const FREELA_BASE_AUDIENCES = [
  'CONTRACTORS_NEVER_PUBLISHED',
  'CONTRACTORS_DORMANT_90D',
  'PROVIDERS_NEVER_APPLIED',
  'PROVIDERS_DORMANT_90D',
] as const;

/** Público que dá para CRIAR numa campanha: os 4 internos + a lista do funil. */
export const FREELA_CREATABLE_AUDIENCES = [...FREELA_BASE_AUDIENCES, 'EXTERNAL_LIST'];

/** Público que dá para PREVER (contar) e usar em campanha automática. */
export const FREELA_PREVIEWABLE_AUDIENCES = [
  ...FREELA_BASE_AUDIENCES,
  'CONTRACTORS_ALL',
  'CONTRACTORS_ACTIVE',
];

export const AUDIENCE_LABELS: Record<string, string> = {
  CONTRACTORS_NEVER_PUBLISHED: 'Contratantes que nunca publicaram vaga',
  CONTRACTORS_DORMANT_90D: 'Contratantes parados há 90 dias',
  PROVIDERS_NEVER_APPLIED: 'Freelancers que nunca se candidataram',
  PROVIDERS_DORMANT_90D: 'Freelancers parados há 90 dias',
  CONTRACTORS_ALL: 'Todos os contratantes',
  CONTRACTORS_ACTIVE: 'Contratantes ativos',
  EXTERNAL_LIST: 'Leads do funil',
};

/** De onde a campanha saiu (`kind` do espelho). */
export const KIND_LABELS: Record<string, string> = {
  disparo: 'disparo do funil',
  cadencia: 'cadência',
  base: 'base do Freela',
  manual: 'lista do funil',
};

/** Status é do Freela — o espelho nunca decide, só copia. */
export const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'rascunho',
  RUNNING: 'rodando',
  PAUSED: 'pausada',
  COMPLETED: 'concluída',
  CANCELLED: 'cancelada',
};

export const FREELA_MODULES: { id: string; label: string }[] = [
  { id: 'bars-restaurants', label: 'Bares e restaurantes' },
  { id: 'home-services', label: 'Serviços em casa' },
];

export const FREELA_CHANNELS: { id: string; label: string }[] = [
  { id: 'WHATSAPP', label: 'WhatsApp' },
  { id: 'PUSH', label: 'Push no aplicativo' },
];

// ── conexão ────────────────────────────────────────────────────
export interface FreelaStatusView {
  configured: boolean;
  reachable: boolean;
  admin_email: string | null;
  /** `meta.schedulerEnabled` do Freela: desligado, a campanha é criada e nada sai. */
  scheduler_enabled: boolean | null;
  per_contact_message: boolean;
  last_sync_at: string | null;
  /** Por que não deu para falar com o Freela (null quando deu). */
  error: string | null;
}

export async function fetchFreelaStatus(): Promise<FreelaStatusView> {
  const { data } = await api.get('/v1/freela/status');
  return data as FreelaStatusView;
}

// ── público do Freela ──────────────────────────────────────────
export interface AudienceCity {
  city: string;
  uf: string | null;
  total: number;
}

export interface AudienceOptionsView {
  total: number;
  cities: AudienceCity[];
}

export interface AudiencePreviewView {
  total: number;
  byChannel: { WHATSAPP: number; EMAIL: number };
  /** Com raio, quem não tem coordenada fica de fora — o número vem para a tela dizer isso. */
  semCoordenada: number;
}

export interface FreelaRadiusInput {
  city: string;
  km: number;
}

/** Recorte do público do Freela pela cobertura da praça. */
export interface FreelaFiltersInput {
  cities?: string[];
  ufs?: string[];
  modules?: string[];
  /** Só em campanha normal — campanha automática não recorta por raio. */
  radius?: FreelaRadiusInput;
}

export async function fetchAudienceOptions(audience: string): Promise<AudienceOptionsView> {
  const { data } = await api.get('/v1/freela/audience-options', { params: { audience } });
  return data as AudienceOptionsView;
}

export async function previewAudience(input: {
  audience: string;
  filters?: FreelaFiltersInput;
}): Promise<AudiencePreviewView> {
  const { data } = await api.post('/v1/freela/audience-preview', {
    audience: input.audience,
    ...(input.filters ? { filters: input.filters } : {}),
  });
  return data as AudiencePreviewView;
}

// ── campanhas (espelho local) ──────────────────────────────────
/**
 * Contagens do Freela copiadas para o espelho — tudo opcional: é JSON dele.
 *
 * O servidor grava `counts` (chaves minúsculas) e, quando ele não vem, o
 * `stats` do detalhe, que tem as MESMAS contagens em MAIÚSCULO (o mapa por
 * status). Os dois nomes ficam declarados porque os dois podem chegar (§18.6).
 */
export interface FreelaCampaignStats {
  total?: number;
  pending?: number;
  sent?: number;
  failed?: number;
  skipped?: number;
  contacted?: number;
  registered?: number;
  PENDING?: number;
  SENT?: number;
  FAILED?: number;
  SKIPPED?: number;
}

export interface FreelaCampaignView {
  id: string;
  freela_id: string;
  name: string;
  kind: string;
  praca_id: string | null;
  disparo_id: string | null;
  audience: string;
  audience_filters: FreelaFiltersInput | null;
  status: string;
  stats: FreelaCampaignStats | null;
  created_by: string;
  created_at: string;
  last_synced_at: string | null;
}

/** Um destinatário como o Freela devolve (camelCase, §18.2). */
export interface FreelaRecipientView {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  channel: string;
  status: string;
  attempts: number;
  variantIndex: number;
  sentAt: string | null;
  failureReason: string | null;
}

export interface FreelaCampaignDetailView {
  campaign: FreelaCampaignView;
  /** O corpo do Freela como veio — a tela lê o espelho, que a rota acabou de atualizar. */
  freela: unknown;
  recipients: FreelaRecipientView[];
  recipients_meta: { total: number; page: number; page_size: number } | null;
}

/** Ritmo anti-bloqueio. Ausente = o ritmo de `GET /v1/settings` convertido (§18.3). */
export interface FreelaPacingInput {
  messages_per_hour?: number;
  daily_cap?: number;
  window_start_hour?: number;
  window_end_hour?: number;
  weekdays_only?: boolean;
}

export interface CreateFreelaCampaignInput {
  name: string;
  praca_id: string;
  audience: string;
  /** Recorte do público do Freela (não vai em `EXTERNAL_LIST`). */
  filters?: FreelaFiltersInput;
  /** Só em `EXTERNAL_LIST`: o MESMO filtro do disparo (§13). */
  lead_filters?: DisparoFilters;
  template_id?: string;
  whatsapp_template?: string;
  pacing?: FreelaPacingInput;
  /** `false` deixa a campanha em `DRAFT` no Freela — quem solta é o `start`. */
  start_now: boolean;
}

export interface CreateFreelaCampaignResult {
  campaign: FreelaCampaignView;
  /** `null` nos públicos do Freela: quem conta lá é a campanha, não o Praça. */
  recipients_count: number | null;
  invalid_phones: number;
  duplicate_phones: number;
  unsupported_variables: string[];
  /** A campanha NASCEU mas o `start` falhou: ela ficou em `DRAFT` e dá para tentar de novo. */
  start_error: string | null;
}

export type FreelaCampaignAction = 'start' | 'pause' | 'cancel';

export async function listFreelaCampaigns(pracaId?: string): Promise<FreelaCampaignView[]> {
  const { data } = await api.get('/v1/freela/campaigns', {
    params: pracaId ? { praca_id: pracaId } : undefined,
  });
  return data as FreelaCampaignView[];
}

export async function createFreelaCampaign(
  input: CreateFreelaCampaignInput,
): Promise<CreateFreelaCampaignResult> {
  const { data } = await api.post('/v1/freela/campaigns', input);
  return data as CreateFreelaCampaignResult;
}

export async function getFreelaCampaign(id: string): Promise<FreelaCampaignDetailView> {
  const { data } = await api.get(`/v1/freela/campaigns/${encodeURIComponent(id)}`);
  return data as FreelaCampaignDetailView;
}

export async function setFreelaCampaignState(
  id: string,
  action: FreelaCampaignAction,
): Promise<FreelaCampaignView> {
  const { data } = await api.patch(`/v1/freela/campaigns/${encodeURIComponent(id)}/${action}`);
  return data as FreelaCampaignView;
}

// ── campanhas automáticas ──────────────────────────────────────
/**
 * A campanha automática **como o Freela guarda** (camelCase), com o vínculo do
 * Praça (`praca_id`) a mais. Datas chegam como ISO no JSON.
 */
export interface FreelaTemplateView {
  id: string;
  name: string;
  enabled: boolean;
  scheduleKind: string;
  weekdays: number[];
  sendHour: number;
  targetMonth: number | null;
  targetDay: number | null;
  targetYear: number | null;
  leadDays: number;
  audience: string;
  audienceFilters: { cities?: string[]; ufs?: string[]; modules?: string[] } | null;
  channels: string[];
  whatsappTemplate: string | null;
  pushTitle: string | null;
  pushBody: string | null;
  imageKey: string | null;
  deepLink: string | null;
  messagesPerHour: number;
  dailyCap: number;
  windowStartHour: number;
  windowEndHour: number;
  weekdaysOnly: boolean;
  maxPerRun: number | null;
  lastRunAt: string | null;
  createdAt: string;
  /** Vínculo local praça ↔ campanha automática (`freela_templates`). */
  praca_id: string | null;
}

/** Corpo do `POST`/`PUT` — snake_case (§18.2). */
export interface FreelaTemplateBody {
  praca_id: string;
  name: string;
  schedule_kind: string;
  weekdays?: number[];
  send_hour?: number;
  target_month?: number;
  target_day?: number;
  target_year?: number;
  lead_days?: number;
  audience: string;
  /** Sem raio: o Freela não recorta campanha automática por raio. */
  filters?: { cities?: string[]; ufs?: string[]; modules?: string[] };
  channels: string[];
  whatsapp_template?: string;
  push_title?: string;
  push_body?: string;
  image_key?: string;
  deep_link?: string;
  pacing?: FreelaPacingInput;
  max_per_run?: number;
}

export interface FreelaUploadResult {
  key: string;
  url: string;
}

export async function listFreelaTemplates(pracaId?: string): Promise<FreelaTemplateView[]> {
  const { data } = await api.get('/v1/freela/templates', {
    params: pracaId ? { praca_id: pracaId } : undefined,
  });
  return data as FreelaTemplateView[];
}

export async function getFreelaTemplate(id: string): Promise<FreelaTemplateView> {
  const { data } = await api.get(`/v1/freela/templates/${encodeURIComponent(id)}`);
  return data as FreelaTemplateView;
}

export async function createFreelaTemplate(body: FreelaTemplateBody): Promise<FreelaTemplateView> {
  const { data } = await api.post('/v1/freela/templates', body);
  return data as FreelaTemplateView;
}

export async function updateFreelaTemplate(
  id: string,
  body: FreelaTemplateBody,
): Promise<FreelaTemplateView> {
  const { data } = await api.put(`/v1/freela/templates/${encodeURIComponent(id)}`, body);
  return data as FreelaTemplateView;
}

export async function setFreelaTemplateEnabled(
  id: string,
  enabled: boolean,
): Promise<FreelaTemplateView> {
  const { data } = await api.patch(`/v1/freela/templates/${encodeURIComponent(id)}/enabled`, {
    enabled,
  });
  return data as FreelaTemplateView;
}

/**
 * A imagem do push passa PELO PRAÇA (campo `file`, PNG/JPEG/WEBP ≤ 5 MB): quem
 * tem a credencial de admin do Freela é a API, não a tela. O que se guarda é a
 * `key` — a `url` é assinada e só serve para a prévia.
 */
export async function uploadFreelaImage(file: File): Promise<FreelaUploadResult> {
  const form = new FormData();
  form.append('file', file);
  const { data } = await api.post('/v1/freela/templates/upload', form);
  return data as FreelaUploadResult;
}
