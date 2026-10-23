/** Wire do consultor de campo — contrato §20 (`docs/api-contract.md`); roteiro: §23; metas: §25. */
import type { GoalView } from '@/modules/consultores/domain/atencao';
import type { CadastrosConfirmados } from './cadastros-confirmados';
import type { SignupPayload } from './cadastro-empresa';
import type { MotivoPulo } from '@/modules/rotas/domain/rota.schema';
import type { ConfigVisita, FluxoVisita } from './fluxo';
import type { ChecklistConfigCampo, ChecklistVisitaView, MarcaChecklist } from './checklist';
import type { ConfigCupomCampo } from '@/modules/cupons/domain/cupons';
import type { PedidoCupomPayload } from '@/modules/cupons/infrastructure/cupons.api';


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
  /** Chaves do servidor que ligam telas (contrato §26.3). Ausente em respostas antigas guardadas no aparelho. */
  features?: {
    company_signup: boolean;
    earnings?: boolean;
    payouts?: boolean;
    visit_flow?: boolean;
    declared_signups?: boolean;
    day_summary?: boolean;
    map_pins?: boolean;
    /** Lote B (contrato §35.6, §37.6). */
    checklist?: boolean;
    breaks?: boolean;
    /** Lote C (contrato §38.1): pedido de cupom da 1ª contratação. */
    vouchers?: boolean;
  };
  /** Modo do chefe §31.4: o fluxo que vale agora para ele. Ausente em respostas antigas guardadas no aparelho = `completo`. */
  visit_flow?: FluxoVisita;
  /** Só com a flag ligada: o que a tela confere sem sinal (o servidor decide). */
  visit_config?: ConfigVisita;
  /** Lote B §35.6: só com `FIELD_CHECKLIST_ENABLED` — a lista para mostrar sem sinal (a foto do servidor vale mais). */
  checklist_config?: ChecklistConfigCampo;
  /** Lote B §37.6: só com `FIELD_BREAKS_ENABLED`. */
  breaks_config?: { intervalo_ativo: boolean; intervalo_lembrete_min: number };
  /** Lote C §38.1: só com `FIELD_VOUCHERS_ENABLED` — o desconto e a validade para a tela de pedir sem sinal. */
  voucher_config?: ConfigCupomCampo;
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

/** Resultado da visita (contrato §30.1): `fechado` = chegou e o estabelecimento estava fechado. */
export type Resultado = 'conversa' | 'fechado';

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
  /** P0 §30 — opcionais no tipo: respostas guardadas no aparelho antes do deploy não têm estes campos (= conversa / vazio). */
  outcome?: Resultado;
  refusal_reason?: string | null;
  refusal_note?: string | null;
  /** `HH:mm` de Brasília. */
  followup_time?: string | null;
  /** Só dígitos (10–11). */
  contact_phone?: string | null;
  /** Modo do chefe §31.5 — só o fluxo `simples` usa. */
  result?: string | null;
  distance_note?: string | null;
  /** Lote B §35.4: marcas do roteiro da conversa. Só existe com o checklist ligado (o servidor recusa com ele desligado). */
  checklist?: MarcaChecklist[] | null;
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
  /** Contrato §31.2. Respostas antigas guardadas no aparelho não têm: valem `completo`. */
  flow?: FluxoVisita;
  answers: VisitAnswers;
  missing: string[];
  /** Lote B §35.6: foto do checklist (só com a flag ligada e foto gravada). Fica FORA de `answers` de propósito. */
  checklist?: ChecklistVisitaView;
}

export interface TodayView {
  day: string;
  journey: JourneyView | null;
  journeys: JourneyView[];
  open_visit: VisitView | null;
  visits: VisitView[];
  counters: { visits: number; cadastrou_qr: number; closed?: number; cadastrou_agora?: number };
  /** Meta e ritmo do próprio consultor com a conta (contrato §25.5); ausente em respostas antigas guardadas no aparelho. */
  goal?: (GoalView & { params: GoalParams }) | null;
  /** Cadastros confirmados pelo Freela hoje/na semana (contrato §27.8); ausente em respostas antigas. */
  signups_confirmed?: CadastrosConfirmados | null;
  /** Lote B §37.6 (só com `FIELD_BREAKS_ENABLED`): os intervalos do dia e o aberto. */
  breaks?: BreakView[];
  breaks_open?: BreakView | null;
}

/** Intervalo da jornada (contrato §37.4). */
export interface BreakView {
  id: string;
  client_id: string;
  journey_id: string;
  started_at: string;
  ended_at: string | null;
  minutes: number;
  end_reason: string | null;
  auto_closed: boolean;
  clock_adjusted: boolean;
}

/** Corpo do início/fim do intervalo: `client_id` + hora real (a posição fica de fora: a localização pausa no intervalo). */
export interface IntervaloPayload {
  client_id: string;
  at: string;
}

/** Horários da configuração: o aparelho recalcula o ritmo com o relógio dele. */
export interface GoalParams {
  meta_diaria: number;
  janela_inicio: string;
  janela_fim: string;
  almoco_inicio: string;
  almoco_fim: string;
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
  /** Contrato §31.2: o fluxo da tela em que o consultor abriu a visita (só quando a flag está ligada). */
  flow?: FluxoVisita;
  place_name: string;
}

/** O que a fila offline guarda (spec §9): cada ação com o `client_id` do aparelho e a hora real. */
export type AcaoFila =
  | { kind: 'start'; payload: { client_id: string } & Posicao }
  | { kind: 'points'; payload: { points: ({ client_id: string } & Posicao)[] } }
  | { kind: 'checkin'; payload: CheckinPayload; foto: Blob }
  | { kind: 'answers'; visit_ref: string; payload: VisitAnswers }
  /** Cadastro assistido (§26): idempotente por `payload.client_id`; a fila NUNCA guarda o link devolvido. */
  | { kind: 'signup'; visit_ref: string; payload: SignupPayload }
  | { kind: 'checkout'; visit_ref: string; payload: Posicao }
  | { kind: 'end'; payload: Posicao }
  // Roteiro do dia (contrato §23.3): idempotentes por `client_id`, com a hora real em `at`.
  | { kind: 'stop_skip'; stop_id: string; payload: { client_id: string; reason: MotivoPulo; note?: string; at: string } }
  | { kind: 'stop_defer'; stop_id: string; payload: { client_id: string; at: string } }
  | { kind: 'stop_undo'; stop_id: string; payload: { client_id: string; at: string } }
  | { kind: 'route_reoptimize'; payload: { client_id: string } & Posicao }
  // Intervalo (lote B, contrato §37.4): idempotentes por `client_id`.
  | { kind: 'break_start'; payload: IntervaloPayload }
  | { kind: 'break_end'; payload: IntervaloPayload }
  // Pedido de cupom (lote C, contrato §38.3): idempotente por `payload.client_id`; `visit_ref` = a visita (o check-in sai antes).
  | { kind: 'voucher'; visit_ref: string; payload: PedidoCupomPayload; place_name: string };

export type ItemFila = AcaoFila & {
  /** Chave do IndexedDB (autoincremento) — é a ordem de envio. */
  seq?: number;
  /** A fila é por consultor: o celular pode trocar de conta com envio pendente. */
  consultant_id: string;
  tentativas: number;
  /** Epoch ms antes do qual não tenta de novo (espera crescente). */
  proxima_em: number;
  criado_em: number;
  /** Desfazer (contrato §31.7): epoch ms antes do qual o item NÃO sai, mesmo com sinal (o `online` não zera). */
  segurar_ate?: number;
  /** Checkout recusado com 422 (questionário incompleto): mensagem da API; a fila para aqui até o consultor corrigir. */
  bloqueio?: string;
};
