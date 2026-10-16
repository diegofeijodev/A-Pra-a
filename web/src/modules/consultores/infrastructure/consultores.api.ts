import { api } from '@/modules/shared/infrastructure/http';
import type { JourneyView, PointView, RouteView, VisitView } from '@/modules/campo/domain/campo.types';

export type { RouteView };

export type PixKeyType = 'cpf' | 'email' | 'telefone' | 'aleatoria';

/** `ConsultorView` — contrato §20.4. */
export interface ConsultorView {
  id: string;
  name: string;
  email: string;
  phone: string;
  cpf: string;
  praca_id: string;
  praca_name: string;
  pix_key_type: PixKeyType;
  pix_key: string;
  active: boolean;
  must_change_password: boolean;
  freela_consultant_id: string | null;
  freela_code: string | null;
  freela_sync_error: string | null;
  freela_synced_at: string | null;
  signup_url: string | null;
  birth_date: string | null;
  age: number | null;
  area_lat: number | null;
  area_lng: number | null;
  area_radius_km: number | null;
  area_bairros: string[];
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ConsultorListItem extends ConsultorView {
  today: { status: 'em_jornada' | 'encerrou' | 'nao_iniciou'; visits: number; cadastros: number; last_point_at: string | null };
}

export interface DiaConsultor {
  day: string;
  journeys: (JourneyView & { points: PointView[] })[];
  visits: VisitView[];
}

export interface CreateConsultorInput {
  name: string;
  email: string;
  phone: string;
  cpf: string;
  praca_id: string;
  pix_key_type: PixKeyType;
  pix_key: string;
  birth_date?: string | null;
  area_lat?: number | null;
  area_lng?: number | null;
  area_radius_km?: number | null;
  area_bairros?: string[];
}

export type UpdateConsultorInput = Partial<CreateConsultorInput> & { active?: boolean };

export async function listConsultores(): Promise<ConsultorListItem[]> {
  const { data } = await api.get('/v1/consultores');
  return data as ConsultorListItem[];
}

export async function getConsultor(id: string): Promise<ConsultorView> {
  const { data } = await api.get(`/v1/consultores/${id}`);
  return data as ConsultorView;
}

export async function createConsultor(input: CreateConsultorInput): Promise<{ consultant: ConsultorView; temp_password: string }> {
  const { data } = await api.post('/v1/consultores', input);
  return data as { consultant: ConsultorView; temp_password: string };
}

export async function updateConsultor(id: string, input: UpdateConsultorInput): Promise<ConsultorView> {
  const { data } = await api.patch(`/v1/consultores/${id}`, input);
  return data as ConsultorView;
}

export async function resetSenhaConsultor(id: string): Promise<{ temp_password: string }> {
  const { data } = await api.post(`/v1/consultores/${id}/reset-password`);
  return data as { temp_password: string };
}

export async function freelaSyncConsultor(id: string): Promise<ConsultorView> {
  const { data } = await api.post(`/v1/consultores/${id}/freela-sync`);
  return data as ConsultorView;
}

export async function diaDoConsultor(id: string, day: string): Promise<DiaConsultor> {
  const { data } = await api.get(`/v1/consultores/${id}/days/${day}`);
  return data as DiaConsultor;
}

export async function fotoDaVisitaEquipe(visitId: string): Promise<Blob> {
  const { data } = await api.get(`/v1/consultores/visits/${visitId}/photo`, { responseType: 'blob' });
  return data as Blob;
}

export async function getCanaisCampo(): Promise<string[]> {
  const { data } = await api.get('/v1/consultores/settings/channels');
  return (data as { channels: string[] }).channels;
}

// ── rotas (§21.5) ──
export interface GenerateRoutesResult {
  generated: number;
  kept_started: number;
  skipped_past: number;
  sem_localizacao: number;
  routes: RouteView[];
}

export async function listRotas(params: { week: string; praca_id?: string; consultant_id?: string }): Promise<RouteView[]> {
  const { data } = await api.get('/v1/consultores/routes', { params });
  return data as RouteView[];
}

export async function gerarRotas(input: { week: string; consultant_ids?: string[] }): Promise<GenerateRoutesResult> {
  const { data } = await api.post('/v1/consultores/routes/generate', input);
  return data as GenerateRoutesResult;
}

export async function editarRota(id: string, stops: { lead_id: string; removed?: boolean }[]): Promise<RouteView> {
  const { data } = await api.patch(`/v1/consultores/routes/${id}`, { stops });
  return data as RouteView;
}

// ── vouchers (§21.7) ──
export type StatusVoucher = 'solicitado' | 'liberado' | 'recusado' | 'usado' | 'expirado';

export interface VoucherView {
  id: string;
  code: string;
  status: StatusVoucher;
  valid_until: string;
  lead_id: string;
  lead_name: string;
  consultant_id: string;
  consultant_name: string;
  visit_id: string;
  praca_id: string;
  freela_ref: string | null;
  decision_note: string | null;
  decided_by_name: string | null;
  decided_at: string | null;
  used_at: string | null;
  created_at: string;
}

export async function listVouchers(params: { status?: StatusVoucher; praca_id?: string } = {}): Promise<VoucherView[]> {
  const { data } = await api.get('/v1/consultores/vouchers', { params });
  return data as VoucherView[];
}

export async function decidirVoucher(id: string, input: { decision: 'liberado' | 'recusado'; freela_ref?: string; note?: string }): Promise<VoucherView> {
  const { data } = await api.post(`/v1/consultores/vouchers/${id}/decide`, input);
  return data as VoucherView;
}

export async function voucherUsado(id: string): Promise<VoucherView> {
  const { data } = await api.post(`/v1/consultores/vouchers/${id}/used`);
  return data as VoucherView;
}

export interface CnaeItem {
  code: string;
  label: string;
}

export async function getCnaes(): Promise<CnaeItem[]> {
  const { data } = await api.get('/v1/consultores/settings/cnaes');
  return (data as { cnaes: CnaeItem[] }).cnaes;
}

export async function putCnaes(cnaes: CnaeItem[]): Promise<CnaeItem[]> {
  const { data } = await api.put('/v1/consultores/settings/cnaes', { cnaes });
  return (data as { cnaes: CnaeItem[] }).cnaes;
}

export async function putCanaisCampo(channels: string[]): Promise<string[]> {
  const { data } = await api.put('/v1/consultores/settings/channels', { channels });
  return (data as { channels: string[] }).channels;
}
