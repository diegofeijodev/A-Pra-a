import { api, configKeepalive } from '@/modules/shared/infrastructure/http';

/**
 * `/v1/disparos` e `/v1/sends` (§13 do contrato).
 *
 * Um disparo é uma mensagem, para um grupo de pessoas, uma vez. Quem monta o
 * público, aplica a lista de bloqueio, a trava de 30 dias, o agendamento e o
 * render lead a lead é o SERVIDOR — a prévia e a fila usam o mesmo plano, então
 * o que foi revisado é o que sai.
 */

export interface DisparoFilters {
  praca_id: string;
  stage: number;
  classe: string;
  origem: string;
  owner_id: string;
  min_stalled: number;
}

export const EMPTY_FILTERS: DisparoFilters = {
  praca_id: 'all',
  stage: 0,
  classe: 'all',
  origem: 'all',
  owner_id: 'all',
  min_stalled: 0,
};

/** Corpo da prévia e da criação (a criação acrescenta `name`). */
export interface DisparoInput {
  filters: DisparoFilters;
  /** Modelo salvo. Vazio quando a prévia vai de `text` (nunca os dois, §13). */
  template_id: string;
  /**
   * Texto escrito na mão, no lugar do modelo — só na PRÉVIA (a criação exige
   * modelo). Variantes separadas por uma linha só com `---`.
   */
  text?: string;
  split: boolean;
  mode: string;
  /** Instante ISO COM fuso — nunca a hora "solta" do `datetime-local`. */
  scheduled_at?: string;
  name?: string;
}

export interface PreviewItemView {
  lead_id: string;
  name: string;
  city: string;
  variant: string;
  text: string;
}

/** Como o modelo fica depois de virar campanha do Freela (§18.3). */
export interface FreelaTemplateView {
  template: string;
  unsupported_variables: string[];
}

export interface DisparoPreviewView {
  audience: number;
  sendable: number;
  blocked: number;
  dupes: number;
  first_at: string;
  eta: string;
  previews: PreviewItemView[];
  /** `null` no modo `fila`. */
  freela: FreelaTemplateView | null;
}

export interface DisparoCountsView {
  total: number;
  queued: number;
  sent: number;
}

export interface DisparoView {
  id: string;
  name: string;
  at: string;
  scheduled_at: string;
  mode: string;
  template_id: string;
  template_name: string;
  split: boolean;
  channel: string;
  by: string;
  filters: DisparoFilters;
  skipped_block: number;
  skipped_dup: number;
  status: string;
  freela_campaign_id: string | null;
  counts: DisparoCountsView;
}

export interface SendLeadView {
  id: string;
  name: string;
  city: string;
  phone: string;
}

export interface SendView {
  id: string;
  lead: SendLeadView;
  variant: string;
  text: string;
  status: string;
  scheduled_at: string;
  sent_at: string | null;
  replied_at: string | null;
  failure_reason: string | null;
  stage_at_send: number;
}

export interface DisparoStatsView {
  queued: number;
  sent: number;
  delivered: number;
  replied: number;
  advanced: number;
  blocked_after: number;
}

export interface DisparoDetailView {
  disparo: DisparoView;
  stats: DisparoStatsView;
  /** Respostas por hora de Brasília, 24 posições. */
  by_hour: number[];
  sends: SendView[];
}

export interface CreateDisparoResult {
  id: string;
  created: number;
  skipped_block: number;
  skipped_dup: number;
}

export async function previewDisparo(input: DisparoInput): Promise<DisparoPreviewView> {
  const { filters, template_id, text, split, mode, scheduled_at } = input;
  const { data } = await api.post('/v1/disparos/preview', {
    filters,
    // Modelo salvo OU texto escrito na mão: mandar os dois é VALIDATION_ERROR.
    ...(text?.trim() ? { text: text.trim() } : { template_id }),
    split,
    mode,
    ...(scheduled_at ? { scheduled_at } : {}),
  });
  return data as DisparoPreviewView;
}

export async function createDisparo(input: DisparoInput): Promise<CreateDisparoResult> {
  const { filters, template_id, split, mode, scheduled_at, name } = input;
  const { data } = await api.post('/v1/disparos', {
    filters,
    template_id,
    split,
    mode,
    ...(scheduled_at ? { scheduled_at } : {}),
    ...(name ? { name } : {}),
  });
  return data as CreateDisparoResult;
}

export async function listDisparos(): Promise<DisparoView[]> {
  const { data } = await api.get('/v1/disparos');
  return data as DisparoView[];
}

export async function getDisparo(id: string): Promise<DisparoDetailView> {
  const { data } = await api.get(`/v1/disparos/${id}`);
  return data as DisparoDetailView;
}

/** `keepalive`: só no envio adiado que sai quando a aba fecha (Tarefas, `configKeepalive`). */
export async function markSend(id: string, status: string, opcoes?: { keepalive?: boolean }): Promise<SendView> {
  const { data } = await api.post(`/v1/sends/${id}/mark`, { status }, configKeepalive(opcoes?.keepalive));
  return data as SendView;
}

/** `blocked: true` = a resposta é um pedido de descadastro e o número já foi bloqueado. */
export async function replySend(id: string, text: string): Promise<{ blocked: boolean }> {
  const { data } = await api.post(`/v1/sends/${id}/reply`, { text });
  return data as { blocked: boolean };
}
