import { api } from '@/modules/shared/infrastructure/http';

/**
 * `LeadListView` (§9 do contrato). Os campos calculados (`stalled_days`,
 * `last_contact_date`, `est_value`) vêm PRONTOS do servidor — no protótipo
 * eram recalculados na tela a cada render.
 *
 * A Task 20 completa este módulo (quadro do funil, ficha, eventos); aqui só o
 * que o bloco "Funil — contratantes" da tela Hoje precisa ler.
 */
export interface LeadListView {
  id: string;
  praca_id: string | null;
  name: string;
  city: string;
  address: string;
  phone: string;
  cnpj: string | null;
  instagram: string;
  site: string;
  decisor: string;
  decisor_role: string;
  classe: string;
  origem: string;
  owner_id: string;
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
  archived?: boolean;
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
