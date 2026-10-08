/** Wire do consultor de campo — contrato §20 (`docs/api-contract.md`). */

export interface CampoConsultantMe {
  id: string;
  name: string;
  email: string;
  phone: string;
  praca_id: string;
  praca_name: string;
  must_change_password: boolean;
  freela_code: string | null;
  signup_url: string | null;
}

export interface CampoSession {
  access_token: string;
  consultant: CampoConsultantMe;
}

export interface CampoLoginResponse {
  access_token: string;
  consultant: CampoConsultantMe;
  must_change_password: boolean;
}

export interface CampoMeResponse {
  consultant: CampoConsultantMe;
  channels: string[];
}

/** Posição + hora real do aparelho. */
export interface Posicao {
  at: string;
  lat: number;
  lng: number;
  accuracy: number;
}

export interface JourneyView {
  id: string;
  client_id: string;
  day: string;
  started_at: string;
  start_lat: number;
  start_lng: number;
  ended_at: string | null;
  end_lat: number | null;
  end_lng: number | null;
  auto_closed: boolean;
}

export interface PointView {
  id: string;
  at: string;
  lat: number;
  lng: number;
  accuracy: number;
  kind: 'start' | 'track' | 'checkin' | 'checkout' | 'end';
  clock_adjusted: boolean;
}

export type Cargo = 'dono' | 'gerente' | 'outro';
export type FreelaStatus = 'ja_usa' | 'cadastrou_qr' | 'nao_cadastrou';
export type Interesse = 'alto' | 'medio' | 'baixo' | 'nenhum';

export interface VisitAnswers {
  interlocutor_name: string | null;
  interlocutor_role: Cargo | null;
  freela_status: FreelaStatus | null;
  interest: Interesse | null;
  open_vagas: number | null;
  vaga_roles: string[];
  freelas_per_week: number | null;
  channels: string[];
  channel_other: string | null;
  needs_followup: boolean | null;
  followup_what: string | null;
  followup_date: string | null;
  notes: string | null;
}

export interface VisitView {
  id: string;
  client_id: string;
  journey_id: string;
  lead_id: string;
  lead_name: string;
  possible_dup: boolean;
  checkin_at: string;
  checkin_lat: number;
  checkin_lng: number;
  checkin_accuracy: number;
  distance_m: number | null;
  far_from_place: boolean;
  photo_bytes: number;
  checkout_at: string | null;
  checkout_lat: number | null;
  checkout_lng: number | null;
  auto_closed: boolean;
  clock_adjusted: boolean;
  answers: VisitAnswers;
  missing: string[];
}

export interface TodayView {
  day: string;
  journey: JourneyView | null;
  journeys: JourneyView[];
  open_visit: VisitView | null;
  visits: VisitView[];
  counters: { visits: number; cadastrou_qr: number };
}

export interface PlaceView {
  id: string;
  name: string;
  address: string;
  stage: number;
  lat: number | null;
  lng: number | null;
  distance_m: number | null;
}

/** Check-in na fila. `place_name` é só da tela (a lista do dia mostra o nome antes de o envio sair). */
export interface CheckinPayload extends Posicao {
  client_id: string;
  lead_id?: string;
  new_place?: { name: string; address?: string };
  confirm_new?: boolean;
  place_name: string;
}

/** O que a fila offline guarda (spec §9): cada ação com o `client_id` do aparelho e a hora real. */
export type AcaoFila =
  | { kind: 'start'; payload: { client_id: string } & Posicao }
  | { kind: 'points'; payload: { points: ({ client_id: string } & Posicao)[] } }
  | { kind: 'checkin'; payload: CheckinPayload; foto: Blob }
  | { kind: 'answers'; visit_ref: string; payload: VisitAnswers }
  | { kind: 'checkout'; visit_ref: string; payload: Posicao }
  | { kind: 'end'; payload: Posicao };

export type ItemFila = AcaoFila & {
  /** Chave do IndexedDB (autoincremento) — é a ordem de envio. */
  seq?: number;
  /** A fila é por consultor: o celular pode trocar de conta com envio pendente. */
  consultant_id: string;
  tentativas: number;
  /** Epoch ms antes do qual não tenta de novo (espera crescente). */
  proxima_em: number;
  criado_em: number;
};
