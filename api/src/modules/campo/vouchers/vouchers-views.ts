import {
  COUPON_STATUS_COM_CODIGO,
  lerParamsCupom,
  situacaoDo,
  type ParamsCupom,
  type Situacao,
} from '../../../domain/voucher-rules';
import type { EventoVoucherRow, VoucherRow } from './vouchers.repository';

/** O que o consultor vê (§38.3). Sem o id do contratante do Freela. */
export interface CampoVoucherView {
  id: string;
  client_id: string;
  lead_id: string;
  visit_id: string | null;
  company_name: string;
  city: string;
  uf: string;
  segment: string;
  freelas_per_week: number;
  status: string;
  situacao: Situacao;
  decision_reason: string | null;
  decided_at: string | null;
  coupon_status: string | null;
  coupon_code: string | null;
  coupon_expires_at: string | null;
  redeemed_at: string | null;
  created_at: string;
  coupon: ParamsCupom | null;
}

/** O que a equipe vê (§38.4). */
export interface VoucherView extends CampoVoucherView {
  consultant_id: string;
  consultant_name: string;
  praca_id: string;
  decided_by_name: string | null;
  contractor_user_id: string | null;
  contractor_name: string | null;
  contractor_source: string | null;
  coupon_params: ParamsCupom | null;
  coupon_error_code: string | null;
  coupon_error: string | null;
  coupon_attempts: number;
  coupon_last_attempt_at: string | null;
  coupon_synced_at: string | null;
}

export interface EventoVoucherView {
  id: string;
  type: string;
  actor_kind: string;
  actor_name: string | null;
  reason: string | null;
  data: Record<string, unknown>;
  created_at: string;
}

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

export function campoVoucherView(v: VoucherRow): CampoVoucherView {
  const comCodigo = v.coupon_status !== null && COUPON_STATUS_COM_CODIGO.includes(v.coupon_status);
  return {
    id: v.id,
    client_id: v.client_id,
    lead_id: v.lead_id,
    visit_id: v.visit_id,
    company_name: v.company_name,
    city: v.city,
    uf: v.uf,
    segment: v.segment,
    freelas_per_week: v.freelas_per_week,
    status: v.status,
    situacao: situacaoDo(v),
    decision_reason: v.decision_reason,
    decided_at: iso(v.decided_at),
    coupon_status: v.coupon_status,
    coupon_code: comCodigo ? v.coupon_code : null,
    coupon_expires_at: iso(v.coupon_expires_at),
    redeemed_at: iso(v.redeemed_at),
    created_at: v.created_at.toISOString(),
    coupon: lerParamsCupom(v.coupon_params),
  };
}

export function voucherView(v: VoucherRow, consultantName: string): VoucherView {
  return {
    ...campoVoucherView(v),
    // A equipe vê o código que será usado também enquanto ele ainda não existe no Freela.
    coupon_code: v.coupon_code,
    consultant_id: v.consultant_id,
    consultant_name: consultantName,
    praca_id: v.praca_id,
    decided_by_name: v.decided_by_name,
    contractor_user_id: v.contractor_user_id,
    contractor_name: v.contractor_name,
    contractor_source: v.contractor_source,
    coupon_params: lerParamsCupom(v.coupon_params),
    coupon_error_code: v.coupon_error_code,
    coupon_error: v.coupon_error,
    coupon_attempts: v.coupon_attempts,
    coupon_last_attempt_at: iso(v.coupon_last_attempt_at),
    coupon_synced_at: iso(v.coupon_synced_at),
  };
}

export const eventoVoucherView = (e: EventoVoucherRow): EventoVoucherView => ({
  id: e.id,
  type: e.type,
  actor_kind: e.actor_kind,
  actor_name: e.actor_name,
  reason: e.reason,
  data: e.data,
  created_at: e.created_at.toISOString(),
});
