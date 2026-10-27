import { api } from '@/modules/shared/infrastructure/http';

/** `cobertura` de uma praça já resolvida pela API a partir do código do IBGE. */
export interface Cobertura {
  uf: string;
  cidade: string;
  ibge: string;
  lat: number;
  lon: number;
  vizinhas: string[];
}

export interface StepState {
  actual: number | null;
  unlock: { by: string; at: string; reason: string } | null;
}

/** `PracaView` (§6 do contrato). */
export interface PracaView {
  id: string;
  name: string;
  city: string;
  start_date: string;
  end_date: string;
  cobertura: Cobertura | null;
  steps: Record<string, StepState>;
  created_at: string;
  /** Redesenho E5.2, G2 (§6): clientes da praça (leads não arquivados, fora os de teste). API antiga não manda = ausente. */
  leads_count?: number;
}

/** No `POST`, `cobertura` entra como `{ibge, km?}` — UF, lat/lon e vizinhas
 *  saem do `GeoService`, nunca do cliente. */
export interface CreatePracaInput {
  name: string;
  city: string;
  start_date: string;
  end_date: string;
  cobertura?: { ibge: string; km?: number };
}

export interface UpdatePracaInput {
  name?: string;
  city?: string;
  start_date?: string;
  end_date?: string;
}

export async function listPracas(): Promise<PracaView[]> {
  const { data } = await api.get('/v1/pracas');
  return data as PracaView[];
}

export async function createPraca(input: CreatePracaInput): Promise<PracaView> {
  const { data } = await api.post('/v1/pracas', input);
  return data as PracaView;
}

export async function updatePraca(id: string, input: UpdatePracaInput): Promise<PracaView> {
  const { data } = await api.patch(`/v1/pracas/${id}`, input);
  return data as PracaView;
}

export async function recalcDates(id: string): Promise<{ ok: boolean; updated: number }> {
  const { data } = await api.post(`/v1/pracas/${id}/recalc-dates`);
  return data as { ok: boolean; updated: number };
}

/** Portão da própria etapa (`{target, dir, label}` do catálogo) ou `null`. */
export interface StepGate {
  target: number;
  dir: 'gte' | 'lte';
  label: string;
}

/**
 * `StepInfoView` (§6). A etapa chega RESOLVIDA do servidor: status, progresso,
 * janela de datas e o motivo da tranca. A tela só pinta — o `stepInfo` que o
 * protótipo calculava no navegador não foi portado.
 */
export interface StepInfoView {
  n: number;
  name: string;
  block: string;
  expected: string;
  gate: StepGate | null;
  status: 'locked' | 'done' | 'active' | 'todo';
  done: number;
  total: number;
  window: [string, string] | null;
  lock_reason: string | null;
  actual: number | null;
  unlock: { by: string; at: string; reason: string } | null;
}

/**
 * `GET /:id/agenda` (§6). `late`, `today` e `next7` são sempre relativos a
 * HOJE (não a `from`/`to`); `from`/`to` (≤ 62 dias) valem só para `by_date`.
 * `load` ignora `person` de propósito — é a barra de carga do dia de todo mundo.
 */
export interface AgendaView {
  late: { action_id: string; date: string; days_late: number }[];
  today: { action_id: string; date: string }[];
  next7: { date: string; action_ids: string[] }[];
  by_date: Record<string, string[]>;
  load: { user_id: string; count: number }[];
}

export interface AgendaParams {
  from?: string;
  to?: string;
  /** `'all'` (padrão) ou o uuid de uma pessoa. */
  person?: string;
}

export async function fetchSteps(pracaId: string): Promise<StepInfoView[]> {
  const { data } = await api.get(`/v1/pracas/${pracaId}/steps`);
  return data as StepInfoView[];
}

export async function fetchAgenda(pracaId: string, params: AgendaParams): Promise<AgendaView> {
  const { data } = await api.get(`/v1/pracas/${pracaId}/agenda`, { params });
  return data as AgendaView;
}

export async function setStepResult(
  pracaId: string,
  n: number,
  value: number,
): Promise<StepInfoView> {
  const { data } = await api.put(`/v1/pracas/${pracaId}/steps/${n}/result`, { value });
  return data as StepInfoView;
}

export async function unlockStep(
  pracaId: string,
  n: number,
  reason: string,
): Promise<StepInfoView> {
  const { data } = await api.post(`/v1/pracas/${pracaId}/steps/${n}/unlock`, { reason });
  return data as StepInfoView;
}
