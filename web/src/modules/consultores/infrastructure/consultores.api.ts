import { api } from '@/modules/shared/infrastructure/http';
import type { CadastrosConfirmados } from '@/modules/campo/domain/cadastros-confirmados';
import type { JourneyView, PointView, VisitView } from '@/modules/campo/domain/campo.types';
import {
  atencaoSchema,
  configAlertasSchema,
  followupsSchema,
  type AtencaoView,
  type ConfigAlertas,
  type FollowupsResponse,
} from '../domain/atencao';

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
  /** Exceção do fluxo da visita (contrato §31.3); `null`/ausente = seguir o padrão. */
  visit_flow?: 'simples' | 'completo' | null;
  /** O fluxo que vale agora para ele (flag + exceção + padrão). */
  visit_flow_effective?: 'simples' | 'completo';
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ConsultorListItem extends ConsultorView {
  today: { status: 'em_jornada' | 'encerrou' | 'nao_iniciou'; visits: number; /** Estabelecimento fechado (§30.1), dentro de `visits`. */ closed?: number; cadastros: number; last_point_at: string | null };
  /** Confirmados pelo Freela (contrato §27.8); `null` se a leitura falhou, ausente em servidor antigo. */
  signups_confirmed?: CadastrosConfirmados | null;
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
}

export type UpdateConsultorInput = Partial<CreateConsultorInput> & { active?: boolean; visit_flow?: 'simples' | 'completo' | null };

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

export async function putCanaisCampo(channels: string[]): Promise<string[]> {
  const { data } = await api.put('/v1/consultores/settings/channels', { channels });
  return (data as { channels: string[] }).channels;
}

// ── metas, atenção agora e retornos (contrato §25) ──────────
export async function getAtencao(pracaId?: string): Promise<AtencaoView> {
  const { data } = await api.get('/v1/consultores/attention', { params: pracaId ? { praca_id: pracaId } : undefined });
  return atencaoSchema.parse(data);
}

export async function getRetornosEquipe(pracaId?: string): Promise<FollowupsResponse> {
  const { data } = await api.get('/v1/consultores/followups', { params: pracaId ? { praca_id: pracaId } : undefined });
  return followupsSchema.parse(data);
}

export async function getConfigAlertas(): Promise<ConfigAlertas> {
  const { data } = await api.get('/v1/consultores/settings/config');
  return configAlertasSchema.parse(data);
}

/** Só as chaves de alerta: o PUT é parcial e as chaves do roteiro (F3) ficam como estão. */
export async function putConfigAlertas(body: Partial<ConfigAlertas>): Promise<ConfigAlertas> {
  const { data } = await api.put('/v1/consultores/settings/config', configAlertasSchema.partial().parse(body));
  return configAlertasSchema.parse(data);
}
