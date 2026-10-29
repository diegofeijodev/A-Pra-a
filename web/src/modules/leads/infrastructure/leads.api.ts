import { api } from '@/modules/shared/infrastructure/http';

/**
 * `LeadListView` (§9 do contrato). Os campos calculados (`stalled_days`,
 * `last_contact_date`, `est_value`) vêm PRONTOS do servidor — no protótipo
 * eram recalculados na tela a cada render.
 */
export interface LeadListView {
  id: string;
  praca_id: string | null;
  name: string;
  city: string;
  address: string;
  phone: string;
  cnpj: string | null;
  instagram: string | null;
  site: string | null;
  decisor: string;
  decisor_role: string;
  classe: string;
  origem: string;
  owner_id: string | null;
  stage: number;
  entered_at: string;
  stage_since: string;
  last_contact_at: string | null;
  last_contact_date: string | null;
  stalled_days: number;
  est_value: number;
  next_step: { what: string; date: string } | null;
  lost_reason: string | null;
  reheat_at: string | null;
  archived: boolean;
  import_batch_id: string | null;
  possible_dup: boolean;
  snooze_until: string | null;
  campanha_id: string | null;
  form_answer: string | null;
  is_test: boolean;
  events_count: number;
  vagas_count: number;
}

export interface LeadEvent {
  id: string;
  at: string;
  author_id: string | null;
  author_label: string | null;
  kind: string;
  text: string;
  stage_to: number | null;
}

export interface LeadVaga {
  id: string;
  date: string;
  funcao: string;
  filled: boolean;
  hours: number | null;
}

/** `LeadView` = `LeadListView` + a ficha inteira. */
export interface LeadView extends LeadListView {
  events: LeadEvent[];
  vagas: LeadVaga[];
}

export interface LeadFilters {
  praca_id?: string;
  q?: string;
  owner_id?: string;
  classe?: string;
  stage?: number;
  /** Texto, é query string: `'true'` traz os dois, o padrão esconde arquivados. */
  archived?: 'true' | 'false';
  campanha_id?: string;
}

export async function listLeads(filters: LeadFilters = {}): Promise<LeadListView[]> {
  const { data } = await api.get('/v1/leads', { params: filters });
  return data as LeadListView[];
}

export async function getLead(id: string): Promise<LeadView> {
  const { data } = await api.get(`/v1/leads/${id}`);
  return data as LeadView;
}

/** Item da fila do dia: o lead inteiro mais a marca de reaquecimento. */
export interface QueueItemView extends LeadListView {
  is_reheat: boolean;
}

/**
 * `GET /v1/leads/queue` — a fila já vem ordenada (casa grande, alvo, depois; e
 * os mais antigos na frente) e já cortada pela cota de `app_settings`. `total`
 * é a fila inteira, para a tela dizer quantos ficaram de fora.
 */
export interface QueueView {
  total: number;
  grandes: number;
  quota: number;
  items: QueueItemView[];
}

/** `GET /v1/leads/metrics` — os seis cartões do topo do quadro. */
export interface LeadsMetricsView {
  total: number;
  conv_contact: number;
  conv_active: number;
  /** A conta de cada taxa (`n` de `de`); opcionais até a API nova estar no ar. */
  conv_contact_n?: number;
  conv_contact_de?: number;
  conv_active_n?: number;
  conv_active_de?: number;
  avg_days: number;
  stalled: number;
  critical: number;
  lost: number;
  pipeline: number;
}

export interface CreateLeadInput {
  praca_id?: string;
  name: string;
  city?: string;
  address?: string;
  phone: string;
  cnpj?: string;
  instagram?: string;
  site?: string;
  decisor?: string;
  decisor_role?: string;
  classe: string;
  origem: string;
  owner_id: string;
  stage?: number;
  campanha_id?: string;
}

/** Mesmos campos do POST, opcionais — menos `stage`: etapa só pelo `/move`. */
export type UpdateLeadInput = Partial<Omit<CreateLeadInput, 'stage'>> & {
  praca_id?: string;
};

export interface MoveLeadInput {
  stage: number;
  next_step?: { what: string; date: string };
  lost_reason?: string;
}

export async function createLead(input: CreateLeadInput): Promise<LeadView> {
  const { data } = await api.post('/v1/leads', input);
  return data as LeadView;
}

export async function updateLead(id: string, input: UpdateLeadInput): Promise<LeadView> {
  const { data } = await api.patch(`/v1/leads/${id}`, input);
  return data as LeadView;
}

export async function moveLead(id: string, input: MoveLeadInput): Promise<LeadView> {
  const { data } = await api.post(`/v1/leads/${id}/move`, input);
  return data as LeadView;
}

export async function addLeadEvent(id: string, kind: string, text: string): Promise<LeadView> {
  const { data } = await api.post(`/v1/leads/${id}/events`, { kind, text });
  return data as LeadView;
}

export async function setLeadNextStep(id: string, what: string, date: string): Promise<LeadView> {
  const { data } = await api.put(`/v1/leads/${id}/next-step`, { what, date });
  return data as LeadView;
}

// POST sem corpo: o Fastify recusa corpo vazio com `Content-Type:
// application/json`, e o axios só carimba esse cabeçalho quando há dados —
// por isso a chamada vai mesmo sem o segundo argumento (§9 do contrato).
export async function archiveLead(id: string): Promise<LeadView> {
  const { data } = await api.post(`/v1/leads/${id}/archive`);
  return data as LeadView;
}

export async function snoozeLead(id: string, until: string): Promise<LeadView> {
  const { data } = await api.post(`/v1/leads/${id}/snooze`, { until });
  return data as LeadView;
}

export async function fetchLeadQueue(person: string): Promise<QueueView> {
  const { data } = await api.get('/v1/leads/queue', { params: { person } });
  return data as QueueView;
}

export async function fetchLeadMetrics(pracaId?: string): Promise<LeadsMetricsView> {
  const { data } = await api.get('/v1/leads/metrics', {
    params: pracaId ? { praca_id: pracaId } : {},
  });
  return data as LeadsMetricsView;
}

/** Leads sem praça — a lista "Sem praça" da tela de Entrada. */
export async function listOrphanLeads(): Promise<LeadListView[]> {
  const { data } = await api.get('/v1/leads/orphans');
  return data as LeadListView[];
}
