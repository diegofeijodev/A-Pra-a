import { api } from '@/modules/shared/infrastructure/http';

/**
 * Indicadores (§16 do contrato).
 *
 * TODO o cálculo do protótipo (`.prototype/src/lib/praca/indicadores.ts`, 428
 * linhas) virou servidor: cada requisição monta o retrato do banco e roda as
 * funções puras de `api/src/domain/indicator-rules.ts`. O que sobra no web é
 * apresentação — `fmtVal` (`lib/format.ts`) e a cor do semáforo (`IndBits`).
 * A API devolve número cru, com a precisão do cálculo.
 */

/** Semáforo: bateu a meta · até 15% fora · abaixo disso · sem número. */
export type Sem = 'ok' | 'warn' | 'bad' | 'none';

export type IndDir = 'gte' | 'lte';

/** `period` ∈ catálogo (`periods`); `livre` exige `from`/`to`. */
export interface PeriodParams {
  period?: string;
  from?: string;
  to?: string;
}

export interface RangeView {
  from: string;
  to: string;
  label: string;
}

export interface IndHistoryPoint {
  date: string;
  value: number;
}

/** Uma linha da lista completa — o `def` + a leitura, achatados pela API. */
export interface IndReadingView {
  key: string;
  name: string;
  what: string;
  meta: number;
  meta_label: string;
  unit: string;
  dir: IndDir;
  freq: string;
  /** Dono resolvido do e-mail do catálogo; `null` se a conta não existe. */
  owner_id: string | null;
  source: string;
  origem: string;
  hero: boolean;
  value: number | null;
  prev: number | null;
  delta: number | null;
  sem: Sem;
  stale: boolean;
  last_at: string | null;
  history: IndHistoryPoint[];
}

export interface ReadingsView {
  range: RangeView;
  readings: IndReadingView[];
}

export interface MilestoneTargetView {
  name: string;
  meta: number;
  unit: string;
  key: string;
  dir: IndDir;
  value: number | null;
  /** Quanto do caminho já foi andado, em % (teto de 100). */
  pct: number;
}

export interface MilestoneView {
  when: string;
  label: string;
  targets: MilestoneTargetView[];
}

export interface MonthPoint {
  month: string;
  label: string;
  value: number;
  meta: number;
}

export interface IndChange {
  name: string;
  from: number;
  to: number;
  pct: number;
  good: boolean;
  unit: string;
}

export interface EmpresaView {
  range: RangeView;
  heroes: IndReadingView[];
  milestones: MilestoneView[];
  months: MonthPoint[];
  changed: { good: IndChange[]; bad: IndChange[] };
}

export interface IndPracaRowView {
  praca: { id: string; name: string };
  step_atual: number;
  ativos: number;
  recontratacao: number | null;
  fill: number | null;
  falta: number | null;
  freelancers: number | null;
  custo: number | null;
  atrasadas: number;
}

export interface IndPersonRowView {
  id: string;
  name: string;
  no_prazo: number;
  atrasadas: number;
  leads_tocados: number;
  leads_avancados: number;
  fechados: number;
  vagas: number;
}

export interface IndCanalRowView {
  id: string;
  label: string;
  leads: number;
  ativos: number;
  conv: number | null;
  custo: number | null;
  tempo_primeira_vaga: number | null;
}

export interface ReadingsParams extends PeriodParams {
  /** `empresa` soma todas as praças; `praca` exige `praca_id`. */
  scope?: 'empresa' | 'praca';
  praca_id?: string;
}

export interface IndicatorEntryInput {
  praca_id: string;
  date: string;
  value: number;
}

export interface IndicatorEntryView {
  praca_id: string;
  key: string;
  date: string;
  value: number;
}

export async function fetchReadings(params: ReadingsParams): Promise<ReadingsView> {
  const { data } = await api.get('/v1/indicators', { params });
  return data as ReadingsView;
}

export async function fetchEmpresa(params: PeriodParams): Promise<EmpresaView> {
  const { data } = await api.get('/v1/indicators/empresa', { params });
  return data as EmpresaView;
}

export async function fetchPracaRows(params: PeriodParams): Promise<IndPracaRowView[]> {
  const { data } = await api.get('/v1/indicators/pracas', { params });
  return data as IndPracaRowView[];
}

export async function fetchPersonRows(params: PeriodParams): Promise<IndPersonRowView[]> {
  const { data } = await api.get('/v1/indicators/pessoas', { params });
  return data as IndPersonRowView[];
}

export async function fetchCanalRows(
  pracaId: string,
  params: PeriodParams,
): Promise<IndCanalRowView[]> {
  const { data } = await api.get('/v1/indicators/canais', {
    params: { ...params, praca_id: pracaId },
  });
  return data as IndCanalRowView[];
}

export async function addEntry(
  key: string,
  input: IndicatorEntryInput,
): Promise<IndicatorEntryView> {
  const { data } = await api.post(`/v1/indicators/${key}/entries`, input);
  return data as IndicatorEntryView;
}
