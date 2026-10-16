/** Projeções do wire (contrato §20) — uma só para o consultor e para a equipe. */
import { faltando, type RespostasVisita } from '../../domain/campo-rules';
import { faltandoV2, type RespostasV2 } from '../../domain/visit-rules';

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

export function journeyView(j: {
  id: string;
  client_id: string;
  day: string;
  started_at: Date;
  start_lat: number;
  start_lng: number;
  ended_at: Date | null;
  end_lat: number | null;
  end_lng: number | null;
  auto_closed: boolean;
}): JourneyView {
  return {
    id: j.id,
    client_id: j.client_id,
    day: j.day,
    started_at: j.started_at.toISOString(),
    start_lat: j.start_lat,
    start_lng: j.start_lng,
    ended_at: j.ended_at?.toISOString() ?? null,
    end_lat: j.end_lat,
    end_lng: j.end_lng,
    auto_closed: j.auto_closed,
  };
}

export interface PointView {
  id: string;
  at: string;
  lat: number;
  lng: number;
  accuracy: number;
  kind: string;
  clock_adjusted: boolean;
}

export function pointView(p: {
  id: string;
  at: Date;
  lat: number;
  lng: number;
  accuracy: number;
  kind: string;
  clock_adjusted: boolean;
}): PointView {
  return { id: p.id, at: p.at.toISOString(), lat: p.lat, lng: p.lng, accuracy: p.accuracy, kind: p.kind, clock_adjusted: p.clock_adjusted };
}

/** Include da visita: o lead, as vagas abertas nela e o voucher (bloco B, §21.6). */
export const COM_LEAD = {
  lead: { select: { name: true, possible_dup: true } },
  vagas: { select: { id: true, date: true, funcao: true, filled: true }, orderBy: { created_at: 'asc' } },
  voucher: { select: { id: true, code: true, status: true, valid_until: true, freela_ref: true, decision_note: true } },
} as const;

export interface VagaDaVisita {
  id: string;
  date: string;
  funcao: string;
  filled: boolean;
}

export interface VoucherDaVisita {
  id: string;
  code: string;
  status: string;
  valid_until: string;
  freela_ref: string | null;
  decision_note: string | null;
}

/** Respostas como saem no wire: as do v1 e as do v2 lado a lado (só as da versão da visita são usadas). */
export type Respostas = RespostasVisita & RespostasV2;

export interface VisitRow extends RespostasVisita, Omit<RespostasV2, keyof RespostasVisita> {
  id: string;
  client_id: string;
  journey_id: string;
  lead_id: string;
  checkin_at: Date;
  checkin_lat: number;
  checkin_lng: number;
  checkin_accuracy: number;
  distance_m: number | null;
  far_from_place: boolean;
  photo_bytes: number;
  checkout_at: Date | null;
  checkout_lat: number | null;
  checkout_lng: number | null;
  auto_closed: boolean;
  clock_adjusted: boolean;
  form_version: number;
  off_route: boolean;
  off_hours: boolean;
  lead: { name: string; possible_dup: boolean };
  vagas: VagaDaVisita[];
  voucher: VoucherDaVisita | null;
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
  form_version: number;
  off_route: boolean;
  off_hours: boolean;
  vagas: VagaDaVisita[];
  voucher: VoucherDaVisita | null;
  answers: Respostas;
  missing: string[];
}

export function respostasV2De(v: RespostasV2): RespostasV2 {
  return {
    interlocutor_name: v.interlocutor_name,
    interlocutor_role: v.interlocutor_role,
    hires_freelancer: v.hires_freelancer,
    channels: v.channels,
    channel_other: v.channel_other,
    freelas_per_week: v.freelas_per_week,
    voucher_accepted: v.voucher_accepted,
    signup_mode: v.signup_mode,
    final_status: v.final_status,
    final_date: v.final_date,
    final_reason: v.final_reason,
    callback_phone: v.callback_phone,
    notes: v.notes,
  };
}

/** O que falta para o checkout, pela versão do formulário. */
export function faltaDaVisita(v: VisitRow, hoje: string): string[] {
  return v.form_version >= 2
    ? faltandoV2(respostasV2De(v), hoje, { voucherPedido: !!v.voucher, vagas: v.vagas.length })
    : faltando(respostasDe(v), hoje);
}

export function respostasDe(v: RespostasVisita): RespostasVisita {
  return {
    interlocutor_name: v.interlocutor_name,
    interlocutor_role: v.interlocutor_role,
    freela_status: v.freela_status,
    interest: v.interest,
    open_vagas: v.open_vagas,
    vaga_roles: v.vaga_roles,
    freelas_per_week: v.freelas_per_week,
    channels: v.channels,
    channel_other: v.channel_other,
    needs_followup: v.needs_followup,
    followup_what: v.followup_what,
    followup_date: v.followup_date,
    notes: v.notes,
  };
}

export function visitView(v: VisitRow, hoje: string): VisitView {
  const answers: Respostas = { ...respostasDe(v), ...respostasV2De(v) };
  return {
    id: v.id,
    client_id: v.client_id,
    journey_id: v.journey_id,
    lead_id: v.lead_id,
    lead_name: v.lead.name,
    possible_dup: v.lead.possible_dup,
    checkin_at: v.checkin_at.toISOString(),
    checkin_lat: v.checkin_lat,
    checkin_lng: v.checkin_lng,
    checkin_accuracy: v.checkin_accuracy,
    distance_m: v.distance_m,
    far_from_place: v.far_from_place,
    photo_bytes: v.photo_bytes,
    checkout_at: v.checkout_at?.toISOString() ?? null,
    checkout_lat: v.checkout_lat,
    checkout_lng: v.checkout_lng,
    auto_closed: v.auto_closed,
    clock_adjusted: v.clock_adjusted,
    form_version: v.form_version,
    off_route: v.off_route,
    off_hours: v.off_hours,
    vagas: v.vagas,
    voucher: v.voucher,
    answers,
    // Visita fechada não "falta" nada: a lista é para o botão de checkout.
    missing: v.checkout_at || v.auto_closed ? [] : faltaDaVisita(v, hoje),
  };
}
