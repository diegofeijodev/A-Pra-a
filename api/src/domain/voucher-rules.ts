/**
 * Cupons da 1ª contratação (restante da Lovable, fases L6a/L6b; contrato §38). Puro: estados, configuração, código
 * determinístico do cupom, corpo do Freela, adoção, espera crescente e leitura do estado. Sem Prisma, HTTP nem relógio.
 */
import { grupoConfig, inteiroEntre, umDe, type GrupoConfig } from './config-grupo';

export const STATUS_VOUCHER = ['pendente', 'aprovado', 'reprovado', 'cancelado'] as const;
export type StatusVoucher = (typeof STATUS_VOUCHER)[number];

export const COUPON_STATUS = [
  'nao_aplicavel',
  'aguardando_vinculo',
  'aguardando_freela',
  'criado',
  'usado',
  'vencido',
  'desativado',
  'erro',
] as const;
export type CouponStatus = (typeof COUPON_STATUS)[number];

/** O que a tela mostra (um rótulo por linha da tabela do §38.5). */
export const SITUACOES = [
  'pedido',
  'reprovado',
  'registrado',
  'aguardando_empresa',
  'aguardando_freela',
  'criado',
  'usado',
  'vencido',
  'desativado',
  'erro',
] as const;
export type Situacao = (typeof SITUACOES)[number];

export const TIPOS_EVENTO_VOUCHER = [
  'requested',
  'approved',
  'rejected',
  'contractor_linked',
  'coupon_created',
  'coupon_adopted',
  'coupon_failed',
  'coupon_retried',
  'coupon_redeemed',
  'coupon_unredeemed',
  'coupon_expired',
  'coupon_deactivated',
] as const;
export type TipoEventoVoucher = (typeof TIPOS_EVENTO_VOUCHER)[number];

export type FonteContratante = 'company_signup' | 'signup_sync' | 'manual';

/** Cupom que já existe (ou existiu) no Freela para o contratante: bloqueia outro do Praça (`CONTRACTOR_ALREADY_HAS_COUPON`). */
export const COUPON_STATUS_QUE_PRENDEM: readonly CouponStatus[] = ['aguardando_freela', 'criado', 'usado', 'vencido', 'desativado', 'erro'];
/** Mostram o código ao consultor. */
export const COUPON_STATUS_COM_CODIGO: readonly CouponStatus[] = ['criado', 'usado', 'vencido', 'desativado'];

export function situacaoDo(v: { status: string; coupon_status: string | null }): Situacao {
  if (v.status === 'pendente') return 'pedido';
  if (v.status === 'reprovado' || v.status === 'cancelado') return 'reprovado';
  switch (v.coupon_status) {
    case 'aguardando_vinculo':
      return 'aguardando_empresa';
    case 'aguardando_freela':
    case 'criado':
    case 'usado':
    case 'vencido':
    case 'desativado':
    case 'erro':
      return v.coupon_status;
    default:
      return 'registrado';
  }
}

/** Filtro de situação → condição sobre status/coupon_status (para a lista da equipe). */
export function condicaoDaSituacao(s: Situacao): { status: StatusVoucher; coupon_status?: CouponStatus | null } {
  switch (s) {
    case 'pedido':
      return { status: 'pendente' };
    case 'reprovado':
      return { status: 'reprovado' };
    case 'registrado':
      return { status: 'aprovado', coupon_status: 'nao_aplicavel' };
    case 'aguardando_empresa':
      return { status: 'aprovado', coupon_status: 'aguardando_vinculo' };
    default:
      return { status: 'aprovado', coupon_status: s };
  }
}

// ── configuração (`field_config.voucher`, §38.2) ─────────────

export interface ConfigVoucher {
  max_por_empresa: number;
  discount_type: 'PERCENT' | 'FIXED';
  percent_off: number | null;
  amount_off_cents: number | null;
  single_use: boolean;
  validade_dias: number | null;
  min_job_hours: number | null;
  motivo_reprovacao: 'obrigatorio' | 'opcional';
  voucher_sync_min: number;
}

const ouNulo = (v: (x: unknown) => boolean) => (x: unknown) => x === null || v(x);

export const CONFIG_VOUCHER: GrupoConfig<ConfigVoucher> = grupoConfig<ConfigVoucher>(
  {
    max_por_empresa: 1,
    discount_type: 'PERCENT',
    percent_off: 100,
    amount_off_cents: null,
    single_use: true,
    validade_dias: 30,
    min_job_hours: null,
    motivo_reprovacao: 'obrigatorio',
    voucher_sync_min: 30,
  },
  {
    max_por_empresa: inteiroEntre(1, 10),
    discount_type: umDe(['PERCENT', 'FIXED']),
    percent_off: ouNulo(inteiroEntre(1, 100)),
    amount_off_cents: ouNulo(inteiroEntre(1, 100_000_000)),
    single_use: (v) => typeof v === 'boolean',
    validade_dias: ouNulo(inteiroEntre(1, 365)),
    min_job_hours: ouNulo(inteiroEntre(1, 24)),
    motivo_reprovacao: umDe(['obrigatorio', 'opcional']),
    voucher_sync_min: inteiroEntre(5, 1440),
  },
  {
    erro: (c) =>
      c.discount_type === 'PERCENT' && c.percent_off == null
        ? 'percent_off: obrigatório com discount_type PERCENT.'
        : c.discount_type === 'FIXED' && c.amount_off_cents == null
          ? 'amount_off_cents: obrigatório com discount_type FIXED.'
          : null,
    corrigir: (c) => ({ ...c, discount_type: 'PERCENT', percent_off: c.percent_off ?? 100 }),
  },
);

/** Chaves em que `null` é um valor (sem prazo, sem teto); nas demais, `null` no PUT = ausente (o web reenvia o que leu). */
export const CHAVES_VOUCHER_ANULAVEIS = ['percent_off', 'amount_off_cents', 'validade_dias', 'min_job_hours'] as const;

/** Parâmetros fotografados na aprovação (`coupon_params`). */
export interface ParamsCupom {
  discount_type: 'PERCENT' | 'FIXED';
  percent_off: number | null;
  amount_off_cents: number | null;
  single_use: boolean;
  validade_dias: number | null;
  min_job_hours: number | null;
}

export const paramsDoCupom = (c: ConfigVoucher): ParamsCupom => ({
  discount_type: c.discount_type,
  percent_off: c.discount_type === 'PERCENT' ? c.percent_off : null,
  amount_off_cents: c.discount_type === 'FIXED' ? c.amount_off_cents : null,
  single_use: c.single_use,
  validade_dias: c.validade_dias,
  min_job_hours: c.min_job_hours,
});

export function lerParamsCupom(raw: unknown): ParamsCupom | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (r.discount_type !== 'PERCENT' && r.discount_type !== 'FIXED') return null;
  const n = (x: unknown) => (typeof x === 'number' && Number.isInteger(x) ? x : null);
  return {
    discount_type: r.discount_type,
    percent_off: n(r.percent_off),
    amount_off_cents: n(r.amount_off_cents),
    single_use: r.single_use !== false,
    validade_dias: n(r.validade_dias),
    min_job_hours: n(r.min_job_hours),
  };
}

/** "100% de desconto · vale 1 vez · 30 dias" (a frase da tela e do diálogo de aprovação). */
export function resumoDoCupom(p: ParamsCupom): string {
  const desconto =
    p.discount_type === 'PERCENT'
      ? `${p.percent_off ?? 0}% de desconto`
      : `R$ ${((p.amount_off_cents ?? 0) / 100).toFixed(2).replace('.', ',')} de desconto`;
  const usos = p.single_use ? 'vale 1 vez' : 'vale mais de uma vez';
  const prazo = p.validade_dias == null ? 'sem prazo' : `${p.validade_dias} ${p.validade_dias === 1 ? 'dia' : 'dias'}`;
  const horas = p.min_job_hours == null ? '' : ` · vagas de ${p.min_job_hours}h ou mais`;
  return `${desconto} · ${usos} · ${prazo}${horas}`;
}

// ── código e corpo do Freela ─────────────────────────────────

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const PREFIXO_CUPOM = 'PRACA-';

/** `PRACA-` + 10 caracteres base32 (RFC 4648, maiúsculos) dos 16 bytes do uuid. Sempre o mesmo para o mesmo pedido. */
export function codigoDoCupom(voucherId: string): string {
  const hex = voucherId.replace(/-/g, '').toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex)) throw new Error('id do pedido inválido para o código do cupom');
  let bits = '';
  for (let i = 0; i < hex.length; i += 2) bits += parseInt(hex.slice(i, i + 2), 16).toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i + 5 <= bits.length && out.length < 10; i += 5) out += BASE32[parseInt(bits.slice(i, i + 5), 2)];
  return PREFIXO_CUPOM + out;
}

/** Corpo do `POST /v1/admin/coupons` (o Freela recusa campo a mais e `percentOff` no FIXED). */
export interface CorpoCupomFreela {
  code: string;
  discountType: 'PERCENT' | 'FIXED';
  percentOff?: number;
  amountOffInCents?: number;
  contractorUserId: string;
  singleUse: boolean;
  minJobHours?: number;
  expiresAt?: string;
}

/** `YYYY-MM-DD` + n dias (calendário puro, sem fuso). */
function somaDias(dia: string, n: number): string {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Validade: 23:59:59 de Brasília (UTC−3) do dia da tentativa + `validade_dias`. `hoje` vem de `todaySp()`. */
export function expiraEm(hoje: string, validadeDias: number | null): string | null {
  if (validadeDias == null) return null;
  return new Date(`${somaDias(hoje, validadeDias)}T23:59:59.000-03:00`).toISOString();
}

export function corpoDoCupom(p: ParamsCupom, code: string, contractorUserId: string, hoje: string): CorpoCupomFreela {
  const expira = expiraEm(hoje, p.validade_dias);
  return {
    code,
    discountType: p.discount_type,
    ...(p.discount_type === 'PERCENT' ? { percentOff: p.percent_off ?? 100 } : { amountOffInCents: p.amount_off_cents ?? 1 }),
    contractorUserId,
    singleUse: p.single_use,
    ...(p.min_job_hours != null ? { minJobHours: p.min_job_hours } : {}),
    ...(expira ? { expiresAt: expira } : {}),
  };
}

/** O que o Freela devolve de um cupom (só o que o Praça usa). */
export interface CupomFreela {
  id: string;
  code: string;
  discountType: 'PERCENT' | 'FIXED';
  percentOff: number | null;
  amountOffInCents: number | null;
  contractorUserId: string;
  singleUse: boolean;
  active: boolean;
  expiresAt: string | null;
  redeemedAt: string | null;
}

/** Adoção (§38.7): mesmo código, mesmo contratante e mesmo desconto = é o nosso (uma tentativa anterior criou e não soubemos). */
export function cupomConfere(c: CupomFreela, esperado: { code: string; contractorUserId: string; params: ParamsCupom }): boolean {
  if (c.code.toUpperCase() !== esperado.code.toUpperCase()) return false;
  if (c.contractorUserId !== esperado.contractorUserId) return false;
  if (c.discountType !== esperado.params.discount_type) return false;
  return esperado.params.discount_type === 'PERCENT'
    ? c.percentOff === esperado.params.percent_off
    : c.amountOffInCents === esperado.params.amount_off_cents;
}

// ── falhas e espera ──────────────────────────────────────────

export type DesfechoFalha =
  /** Pode ter sido criado (código já usado, 5xx, timeout, resposta torta): reler a lista e adotar se conferir. */
  | { tipo: 'reler'; code: string }
  /** Tenta de novo depois (espera crescente). */
  | { tipo: 'transitorio'; code: string }
  /** Recusa do Freela: `erro`, só o "Tentar agora" repete. */
  | { tipo: 'rejeitado'; code: string };

/** Erro de uma chamada ao Freela → o que fazer. Lê só `status`/`code` (nunca a mensagem, que pode ecoar dado). */
export function desfechoDaFalha(e: { status?: number; code?: string; freelaStatus?: number; freelaCode?: string }): DesfechoFalha {
  if (e.code === 'FREELA_NOT_CONFIGURED') return { tipo: 'transitorio', code: 'FREELA_NOT_CONFIGURED' };
  if (e.freelaStatus !== undefined) {
    if (e.freelaStatus === 400 && e.freelaCode === 'COUPON_CODE_TAKEN') return { tipo: 'reler', code: 'COUPON_CODE_TAKEN' };
    if (e.freelaStatus >= 500) return { tipo: 'reler', code: 'FREELA_5XX' };
    if (e.freelaStatus === 401 || e.freelaStatus === 403) return { tipo: 'transitorio', code: 'FREELA_AUTH' };
    if (e.freelaStatus === 408 || e.freelaStatus === 429) return { tipo: 'transitorio', code: 'FREELA_BUSY' };
    return { tipo: 'rejeitado', code: 'FREELA_REJECTED' };
  }
  if (e.code === 'FREELA_UNREACHABLE' || e.code === 'FREELA_ERROR') return { tipo: 'reler', code: e.code };
  return { tipo: 'transitorio', code: 'FREELA_UNKNOWN' };
}

/** Mensagem FIXA por código (nunca a do Freela): vai para `coupon_error` e para a tela. */
export const MENSAGEM_ERRO_CUPOM: Record<string, string> = {
  FREELA_NOT_CONFIGURED: 'Aprovado — aguardando conexão com o Freela.',
  COUPON_CODE_TAKEN: 'O Freela já tinha este código e não confirmou que é o nosso. Tentamos de novo sozinhos.',
  FREELA_5XX: 'O Freela não respondeu direito. Tentamos de novo sozinhos.',
  FREELA_UNREACHABLE: 'O Freela não respondeu. Tentamos de novo sozinhos.',
  FREELA_ERROR: 'O Freela respondeu fora do formato esperado. Tentamos de novo sozinhos.',
  FREELA_AUTH: 'A conta do Praça no Freela foi recusada. Confira a conexão do Freela.',
  FREELA_BUSY: 'O Freela pediu para esperar. Tentamos de novo sozinhos.',
  FREELA_UNKNOWN: 'Não deu para criar o cupom agora. Tentamos de novo sozinhos.',
  FREELA_REJECTED: 'O Freela recusou o cupom. Confira o desconto e a conta da empresa e use "Tentar agora".',
  COUPON_CODE_CONFLICT: 'Já existe no Freela um cupom com este código para outra empresa ou outro desconto. Fale com o suporte do Freela.',
};

const ESPERAS_MIN = [2, 4, 8, 16, 32, 60] as const;
/** Espera depois da n-ésima tentativa (1 = primeira): 2, 4, 8, 16, 32 e depois 60 min. */
export const esperaMin = (tentativas: number): number => ESPERAS_MIN[Math.min(Math.max(tentativas, 1), ESPERAS_MIN.length) - 1]!;

export function devidoAgora(v: { coupon_attempts: number; coupon_last_attempt_at: Date | null }, agora: Date): boolean {
  if (!v.coupon_last_attempt_at || v.coupon_attempts <= 0) return true;
  return agora.getTime() - v.coupon_last_attempt_at.getTime() >= esperaMin(v.coupon_attempts) * 60_000;
}

// ── leitura do estado no Freela (§38.7) ──────────────────────

export interface MudancaDoSync {
  para: CouponStatus;
  evento: TipoEventoVoucher;
  redeemed_at?: Date | null;
}

/** Estado novo de um cupom `criado`/`usado` a partir do que o Freela diz (`null` = nada mudou). */
export function mudancaDoSync(atual: CouponStatus, c: CupomFreela, agora: Date): MudancaDoSync | null {
  if (atual !== 'criado' && atual !== 'usado') return null;
  if (!c.active) return { para: 'desativado', evento: 'coupon_deactivated' };
  if (c.redeemedAt && atual === 'criado') return { para: 'usado', evento: 'coupon_redeemed', redeemed_at: new Date(c.redeemedAt) };
  if (!c.redeemedAt && atual === 'usado') return { para: 'criado', evento: 'coupon_unredeemed', redeemed_at: null };
  if (!c.redeemedAt && atual === 'criado' && c.expiresAt && new Date(c.expiresAt).getTime() < agora.getTime()) {
    return { para: 'vencido', evento: 'coupon_expired' };
  }
  return null;
}

/** Hora de ler o estado de novo? `voucher_sync_min` desde a última leitura (`null` = nunca leu). */
export const horaDeLer = (ultima: Date | null, agora: Date, syncMin: number): boolean =>
  !ultima || agora.getTime() - ultima.getTime() >= syncMin * 60_000;

// ── textos ───────────────────────────────────────────────────

const dd_mm = (d: Date): string => {
  const sp = new Date(d.getTime() - 3 * 60 * 60_000);
  return `${String(sp.getUTCDate()).padStart(2, '0')}/${String(sp.getUTCMonth() + 1).padStart(2, '0')}`;
};

export function mensagemDoLimite(existente: { consultant_name: string; created_at: Date; status: string }): string {
  return existente.status === 'aprovado'
    ? `Esta empresa já tem um cupom aprovado (pedido por ${existente.consultant_name} em ${dd_mm(existente.created_at)}).`
    : `Esta empresa já tem um cupom pedido, por ${existente.consultant_name} em ${dd_mm(existente.created_at)}.`;
}
