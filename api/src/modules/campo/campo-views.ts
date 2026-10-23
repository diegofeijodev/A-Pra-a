/** Projeções do wire (contrato §20) — uma só para o consultor e para a equipe. */
import { faltando, type RespostasVisita } from '../../domain/campo-rules';
import { lerFotoChecklist, pendenciasChecklist, viewDoChecklist } from '../../domain/checklist-rules';
import { CONFIG_MODO_PADRAO, faltandoSimples, type ConfigModo } from '../../domain/modo-campo-rules';

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

/** Include do lead que a visita mostra. */
export const COM_LEAD = { lead: { select: { name: true, possible_dup: true } } } as const;

export interface VisitRow extends RespostasVisita {
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
  /** Modo do chefe §31.2: fluxo gravado na abertura. Ausente na linha (testes/antigas) = `completo`. */
  flow?: string;
  /** Lote B §35.3: foto do checklist (JSON). Ausente na linha (testes/antigas) = sem foto. */
  checklist?: unknown;
  lead: { name: string; possible_dup: boolean };
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
  /** `simples` | `completo` (contrato §31.2). */
  flow: string;
  answers: RespostasVisita;
  missing: string[];
  /** Lote B §35.6: só com `FIELD_CHECKLIST_ENABLED` e foto gravada (fora de `answers`: o web reenvia `answers` no rascunho). */
  checklist?: ReturnType<typeof viewDoChecklist>;
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
    // P0 §30: sempre explícitos no wire (ausente na linha = default).
    outcome: v.outcome ?? 'conversa',
    refusal_reason: v.refusal_reason ?? null,
    refusal_note: v.refusal_note ?? null,
    followup_time: v.followup_time ?? null,
    contact_phone: v.contact_phone ?? null,
    // Modo do chefe §31.5: sempre explícitos no wire.
    result: v.result ?? null,
    distance_note: v.distance_note ?? null,
  };
}

/** Opções dos lotes B e E: com as flags desligadas a projeção é a de hoje, byte a byte. */
export interface OpcoesView {
  checklist?: boolean;
  /** Lote E §41.4: `answers.contact_email` só com `FIELD_CONTACT_EMAIL_ENABLED` (completo: o consultor dono e o detalhe da equipe). */
  contact_email?: boolean;
}

export function visitView(v: VisitRow, hoje: string, modo: ConfigModo = CONFIG_MODO_PADRAO, opcoes: OpcoesView = {}): VisitView {
  const answers = respostasDe(v);
  if (opcoes.contact_email) answers.contact_email = (v as { contact_email?: string | null }).contact_email ?? null;
  const foto = opcoes.checklist ? lerFotoChecklist(v.checklist) : null;
  const fechada = !!v.checkout_at || v.auto_closed;
  const view: VisitView = {
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
    flow: v.flow ?? 'completo',
    answers,
    // Visita fechada não "falta" nada: a lista é para o botão de checkout. A conta segue o fluxo da visita (§31.2).
    missing: fechada
      ? []
      : [
          ...(v.flow === 'simples'
            ? faltandoSimples(answers, hoje, modo, { far_from_place: v.far_from_place })
            : faltando(answers, hoje)),
          // §35.5: a obrigatoriedade vem da FOTO do check-in (e só com a flag ligada).
          ...pendenciasChecklist(foto),
        ],
  };
  if (foto) view.checklist = viewDoChecklist(foto);
  return view;
}
