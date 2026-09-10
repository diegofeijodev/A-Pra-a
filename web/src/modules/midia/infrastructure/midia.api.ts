import { api } from '@/modules/shared/infrastructure/http';

/**
 * `/v1/campanhas`, `/v1/creatives`, `/v1/traffic` e `/v1/proofs` (§15 do
 * contrato).
 *
 * Tudo que o protótipo calculava na tela — o nome padronizado da campanha, os
 * números (`metrics`), o portão das etapas 2 e 6 (`gate`) e o freio de
 * preenchimento — vem PRONTO do servidor. A tela só exibe.
 *
 * Campo opcional deste bloco é OMITIDO, nunca enviado como `null`: `null` em
 * `status`, `justification`, `file_url`, `text`, `manager_url`, `auto` ou
 * `api_connected` é `400 VALIDATION_ERROR`. Os três que o banco aceita nulo de
 * verdade (`owner_id`, `publish_at`, `ia`) vão como `null` normalmente.
 */

// ── provas ─────────────────────────────────────────────────────
export interface ProofView {
  id: string;
  praca_id: string;
  kind: string;
  title: string;
}

export interface ProofBody {
  praca_id: string;
  kind: string;
  title: string;
}

// ── campanhas ──────────────────────────────────────────────────
export interface GateJustificationView {
  by: string;
  at: string;
  text: string;
}

/** Números da campanha (`campMetrics` do protótipo), calculados no servidor. */
export interface CampMetricsView {
  investido: number;
  alcance: number;
  cliques: number;
  conversoes: number;
  /** Custo por CONVERSÃO — o protótipo chama de `cpc`. */
  cpc: number;
  leads: number;
  cadastros: number;
  ativos: number;
  cp_cadastro: number;
  cp_ativo: number;
  acima_teto: boolean;
}

/** Portão do playbook (etapas 2 e 6) da praça DESTA campanha. */
export interface GateView {
  ok: boolean;
  falta: string[];
}

export interface CampanhaView {
  id: string;
  /** Montado pelo servidor (`BH-Contratante-Cadastro-Set26`) — não entra no corpo. */
  name: string;
  praca_id: string;
  publico: string;
  objetivo: string;
  start: string;
  end: string;
  verba: number;
  gasto: number;
  dor: string;
  oferta: string;
  mensagem_chave: string;
  provas: string[];
  destino: string;
  kpi_name: string;
  kpi_meta: number;
  kpi_custo: number;
  cac_teto: number;
  status: string;
  gate_justification: GateJustificationView | null;
  created_at: string;
  metrics: CampMetricsView;
  gate: GateView;
}

/**
 * Corpo do `POST` e do `PUT`. `name` NÃO entra (whitelist → 400); `status`
 * omitido vira `rascunho` no `POST` e mantém o atual no `PUT`.
 */
export interface CampanhaBody {
  praca_id: string;
  publico: string;
  objetivo: string;
  start: string;
  end: string;
  verba: number;
  gasto: number;
  dor: string;
  oferta: string;
  mensagem_chave: string;
  provas: string[];
  destino: string;
  kpi_name: string;
  kpi_meta: number;
  kpi_custo: number;
  cac_teto: number;
  status?: string;
  justification?: string;
}

export interface SuggestNameInput {
  praca_id: string;
  publico: string;
  objetivo: string;
  start: string;
}

/** Freio automático de mídia da praça: média de horas para preencher a vaga. */
export interface FillBrakeView {
  praca_id: string;
  fill_hours: number | null;
  limit_h: number;
  above: boolean;
}

// ── criativos ──────────────────────────────────────────────────
export interface CreativeRoteiro {
  gancho: string;
  desenvolvimento: string;
  prova: string;
  cta: string;
}

export interface CreativeIa {
  tool: string;
  prompt: string;
}

export interface CreativeCommentView {
  id: string;
  at: string;
  author: string;
  kind: string;
  text: string;
}

export interface CreativeView {
  id: string;
  campanha_id: string;
  formato: string;
  titulo: string;
  gancho: string;
  roteiro: CreativeRoteiro;
  legenda: string;
  cta_botao: string;
  owner_id: string | null;
  due: string;
  publish_at: string | null;
  status: string;
  file_url: string;
  ia: CreativeIa | null;
  approved_at: string | null;
  created_at: string;
  comments: CreativeCommentView[];
}

export interface CreativeBody {
  /** No `PUT` tem de ser o mesmo do criativo — trocar de campanha é 400. */
  campanha_id: string;
  formato: string;
  titulo: string;
  gancho: string;
  roteiro: CreativeRoteiro;
  legenda: string;
  cta_botao: string;
  owner_id: string | null;
  due: string;
  publish_at: string | null;
  status: string;
  file_url: string;
  ia: CreativeIa | null;
}

/** Roteiro-modelo do catálogo (§4) — a borda do catálogo só confere `id`/`name`. */
export interface ScriptModelView {
  id: string;
  name: string;
  formato: string;
  publico: string;
  titulo: string;
  gancho: string;
  roteiro: CreativeRoteiro;
  legenda: string;
  cta_botao: string;
  aviso?: string;
}

// ── tráfego ────────────────────────────────────────────────────
export interface TrafficDayView {
  id: string;
  entry_id: string;
  date: string;
  investido: number;
  alcance: number;
  cliques: number;
  conversoes: number;
  auto: boolean;
}

export interface TrafficEntryView {
  id: string;
  campanha_id: string;
  plataforma: string;
  nome_la: string;
  publico: string;
  geo: string;
  verba_diaria: number;
  criativos: string[];
  manager_url: string;
  api_connected: boolean;
  days: TrafficDayView[];
}

export interface TrafficBody {
  campanha_id: string;
  plataforma: string;
  nome_la: string;
  publico: string;
  geo: string;
  verba_diaria: number;
  criativos: string[];
  manager_url: string;
  api_connected: boolean;
}

/** Lançamento de um dia — upsert por data (`entry_id + date` é único). */
export interface TrafficDayBody {
  date: string;
  investido: number;
  alcance: number;
  cliques: number;
  conversoes: number;
  auto?: boolean;
}

// ── provas ─────────────────────────────────────────────────────
export async function listProofs(pracaId: string): Promise<ProofView[]> {
  const { data } = await api.get('/v1/proofs', { params: { praca_id: pracaId } });
  return data as ProofView[];
}

export async function createProof(body: ProofBody): Promise<ProofView> {
  const { data } = await api.post('/v1/proofs', body);
  return data as ProofView;
}

// ── campanhas ──────────────────────────────────────────────────
export async function listCampanhas(pracaId?: string): Promise<CampanhaView[]> {
  const { data } = await api.get('/v1/campanhas', {
    params: pracaId ? { praca_id: pracaId } : undefined,
  });
  return data as CampanhaView[];
}

export async function createCampanha(body: CampanhaBody): Promise<CampanhaView> {
  const { data } = await api.post('/v1/campanhas', body);
  return data as CampanhaView;
}

export async function replaceCampanha(id: string, body: CampanhaBody): Promise<CampanhaView> {
  const { data } = await api.put(`/v1/campanhas/${id}`, body);
  return data as CampanhaView;
}

export async function deleteCampanha(id: string): Promise<void> {
  await api.delete(`/v1/campanhas/${id}`);
}

export async function duplicateCampanha(id: string, pracaId: string): Promise<CampanhaView> {
  const { data } = await api.post(`/v1/campanhas/${id}/duplicate`, { praca_id: pracaId });
  return data as CampanhaView;
}

/** `justification` só vai quando existe: `null` no corpo é 400. */
export async function setCampanhaStatus(
  id: string,
  status: string,
  justification?: string,
): Promise<CampanhaView> {
  const { data } = await api.post(`/v1/campanhas/${id}/status`, {
    status,
    ...(justification ? { justification } : {}),
  });
  return data as CampanhaView;
}

export async function suggestCampanhaName(input: SuggestNameInput): Promise<{ name: string }> {
  const { data } = await api.post('/v1/campanhas/suggest-name', input);
  return data as { name: string };
}

export async function fetchFillBrake(pracaId: string): Promise<FillBrakeView> {
  const { data } = await api.get('/v1/campanhas/fill-hours', { params: { praca_id: pracaId } });
  return data as FillBrakeView;
}

// ── criativos ──────────────────────────────────────────────────
export async function listCreatives(campanhaId: string): Promise<CreativeView[]> {
  const { data } = await api.get('/v1/creatives', { params: { campanha_id: campanhaId } });
  return data as CreativeView[];
}

export async function createCreative(body: CreativeBody): Promise<CreativeView> {
  const { data } = await api.post('/v1/creatives', body);
  return data as CreativeView;
}

export async function replaceCreative(id: string, body: CreativeBody): Promise<CreativeView> {
  const { data } = await api.put(`/v1/creatives/${id}`, body);
  return data as CreativeView;
}

export async function deleteCreative(id: string): Promise<void> {
  await api.delete(`/v1/creatives/${id}`);
}

export async function setCreativeStatus(id: string, status: string): Promise<CreativeView> {
  const { data } = await api.post(`/v1/creatives/${id}/status`, { status });
  return data as CreativeView;
}

export async function setCreativePublishDate(id: string, date: string): Promise<CreativeView> {
  const { data } = await api.post(`/v1/creatives/${id}/publish-date`, { date });
  return data as CreativeView;
}

/** `aprovacao` sem texto grava o comentário "Aprovado."; `ajuste` exige texto. */
export async function reviewCreative(
  id: string,
  kind: string,
  text?: string,
): Promise<CreativeView> {
  const { data } = await api.post(`/v1/creatives/${id}/review`, {
    kind,
    ...(text ? { text } : {}),
  });
  return data as CreativeView;
}

// ── tráfego ────────────────────────────────────────────────────
export async function listTraffic(campanhaId: string): Promise<TrafficEntryView[]> {
  const { data } = await api.get('/v1/traffic', { params: { campanha_id: campanhaId } });
  return data as TrafficEntryView[];
}

export async function createTraffic(body: TrafficBody): Promise<TrafficEntryView> {
  const { data } = await api.post('/v1/traffic', body);
  return data as TrafficEntryView;
}

export async function replaceTraffic(id: string, body: TrafficBody): Promise<TrafficEntryView> {
  const { data } = await api.put(`/v1/traffic/${id}`, body);
  return data as TrafficEntryView;
}

export async function deleteTraffic(id: string): Promise<void> {
  await api.delete(`/v1/traffic/${id}`);
}

export async function saveTrafficDay(id: string, body: TrafficDayBody): Promise<TrafficDayView> {
  const { auto, ...rest } = body;
  const { data } = await api.put(`/v1/traffic/${id}/days`, {
    ...rest,
    ...(auto === undefined ? {} : { auto }),
  });
  return data as TrafficDayView;
}

/** "Puxar pela API" — sem `api_connected` o servidor responde 400 `API_NOT_CONNECTED`. */
export async function pullTrafficApi(id: string): Promise<TrafficDayView> {
  const { data } = await api.post(`/v1/traffic/${id}/pull-api`);
  return data as TrafficDayView;
}
