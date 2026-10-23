/**
 * Persistência dos pedidos de cupom (contrato §38). Nada é apagado: o pedido só muda por `transitar` (compare-and-set) e
 * toda mudança de estado grava um evento na MESMA transação. Eventos só recebem INSERT. A transação abre com
 * `pg_advisory_xact_lock(hashtext(chave))` (chave `voucher-lead:<lead>` no pedido, `voucher:<id>` nas decisões).
 */
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../common/database/prisma.service';
import type { CouponStatus, FonteContratante, StatusVoucher, TipoEventoVoucher } from '../../../domain/voucher-rules';

export interface VoucherNovo {
  client_id: string;
  consultant_id: string;
  praca_id: string;
  lead_id: string;
  visit_id: string | null;
  company_name: string;
  uf: string;
  city: string;
  segment: string;
  freelas_per_week: number;
}

export interface VoucherRow extends VoucherNovo {
  id: string;
  status: StatusVoucher;
  decision_reason: string | null;
  decided_by: string | null;
  decided_by_name: string | null;
  decided_at: Date | null;
  contractor_user_id: string | null;
  contractor_name: string | null;
  contractor_source: FonteContratante | null;
  coupon_status: CouponStatus | null;
  coupon_code: string | null;
  coupon_id: string | null;
  coupon_params: unknown;
  coupon_expires_at: Date | null;
  coupon_error_code: string | null;
  coupon_error: string | null;
  coupon_attempts: number;
  coupon_last_attempt_at: Date | null;
  coupon_synced_at: Date | null;
  redeemed_at: Date | null;
  created_at: Date;
}

/** O que pode mudar num pedido (o trigger barra o resto). */
export type MudancaVoucher = Partial<
  Pick<
    VoucherRow,
    | 'status'
    | 'decision_reason'
    | 'decided_by'
    | 'decided_by_name'
    | 'decided_at'
    | 'contractor_user_id'
    | 'contractor_name'
    | 'contractor_source'
    | 'coupon_status'
    | 'coupon_code'
    | 'coupon_id'
    | 'coupon_params'
    | 'coupon_expires_at'
    | 'coupon_error_code'
    | 'coupon_error'
    | 'coupon_attempts'
    | 'coupon_last_attempt_at'
    | 'coupon_synced_at'
    | 'redeemed_at'
  >
>;

export type AtorVoucher = 'consultor' | 'equipe' | 'sistema';

export interface EventoVoucherNovo {
  voucher_id: string;
  type: TipoEventoVoucher;
  client_id: string | null;
  actor_kind: AtorVoucher;
  actor_id: string | null;
  actor_name: string | null;
  reason: string | null;
  /** Nunca telefone nem e-mail. */
  data: Record<string, unknown>;
}

export interface EventoVoucherRow extends EventoVoucherNovo {
  id: string;
  created_at: Date;
}

/** Condição do compare-and-set: o pedido ainda está assim. */
export interface CondicaoVoucher {
  status?: StatusVoucher;
  coupon_status?: CouponStatus | null;
}

export interface FiltroVouchers {
  consultant_id?: string;
  praca_id?: string;
  status?: StatusVoucher;
  coupon_status?: CouponStatus | null;
  desde?: Date;
  ate?: Date;
  q?: string;
  limit?: number;
}

export interface LeadDoPedido {
  id: string;
  name: string;
  city: string;
  praca_id: string | null;
}

export interface VouchersLeitura {
  porId(id: string): Promise<VoucherRow | null>;
  porClientId(clientId: string): Promise<VoucherRow | null>;
  eventoPorClientId(clientId: string): Promise<EventoVoucherRow | null>;
  eventos(voucherId: string): Promise<EventoVoucherRow[]>;
  listar(f: FiltroVouchers): Promise<VoucherRow[]>;
  /** Contagem por (status, coupon_status) com o filtro (sem a situação). */
  contar(f: FiltroVouchers): Promise<{ status: string; coupon_status: string | null; n: number }[]>;
  /** Pendentes + aprovados do estabelecimento (o limite por empresa), mais antigos primeiro. */
  ativosDoLead(leadId: string): Promise<VoucherRow[]>;
  /** Outro pedido do Praça que já prende o contratante (cupom criado, usado, vencido, desativado, erro ou na fila). */
  comCupomDoContratante(contractorUserId: string, exceto: string): Promise<VoucherRow | null>;
  /** `aguardando_freela`, a tentativa mais antiga primeiro. */
  aguardandoFreela(limite: number): Promise<VoucherRow[]>;
  aguardandoVinculo(limite: number): Promise<VoucherRow[]>;
  comCupomAtivo(): Promise<VoucherRow[]>;
  /** Maior `coupon_synced_at` dos cupons `criado`/`usado` (a última leitura do estado). */
  ultimaLeitura(): Promise<Date | null>;
  nomesDosConsultores(ids: string[]): Promise<Map<string, string>>;
  // contexto do pedido (fora da tabela de cupons)
  visitaDoConsultor(consultantId: string, ref: string): Promise<{ id: string; lead_id: string } | null>;
  lead(id: string): Promise<LeadDoPedido | null>;
  praca(id: string): Promise<{ city: string; cobertura_uf: string | null; cobertura_cidade: string | null } | null>;
  /** Passo 1 do vínculo (§38.6): conta do Freela criada pelo cadastro assistido do lead. */
  contratanteDoCadastro(leadId: string): Promise<string | null>;
  /** Passo 2 do vínculo (§38.6): cadastro confirmado pelo Freela pareado com o lead. */
  contratanteDoSync(leadId: string): Promise<string | null>;
  lerConfig(): Promise<unknown>;
}

export interface VouchersTx extends VouchersLeitura {
  criar(n: VoucherNovo, evento: Omit<EventoVoucherNovo, 'voucher_id'>): Promise<VoucherRow>;
  /** Compare-and-set: só muda se o pedido ainda está em `de`. `null` = alguém chegou antes. Grava o evento junto. */
  transitar(
    id: string,
    de: CondicaoVoucher,
    mudanca: MudancaVoucher,
    evento: Omit<EventoVoucherNovo, 'voucher_id'> | null,
  ): Promise<VoucherRow | null>;
  /** Evento sem mudança de estado (ex.: o vínculo gravado junto com a aprovação). */
  inserirEvento(voucherId: string, e: Omit<EventoVoucherNovo, 'voucher_id'>): Promise<void>;
  gravarConfig(cfg: Record<string, unknown>): Promise<void>;
}

export interface VouchersRepository extends VouchersLeitura {
  emTransacao<T>(chave: string, fn: (tx: VouchersTx) => Promise<T>): Promise<T>;
}

export const VOUCHERS_REPOSITORY = Symbol('VOUCHERS_REPOSITORY');

type Cliente = Prisma.TransactionClient | PrismaService;

const paraVoucher = (r: Record<string, any>): VoucherRow => ({ ...(r as VoucherRow) });
const paraEvento = (r: Record<string, any>): EventoVoucherRow => ({ ...(r as EventoVoucherRow), data: (r.data ?? {}) as Record<string, unknown> });

function onde(f: FiltroVouchers): Prisma.field_vouchersWhereInput {
  return {
    ...(f.consultant_id ? { consultant_id: f.consultant_id } : {}),
    ...(f.praca_id ? { praca_id: f.praca_id } : {}),
    ...(f.status ? { status: f.status } : {}),
    ...(f.coupon_status !== undefined ? { coupon_status: f.coupon_status } : {}),
    ...(f.desde || f.ate ? { created_at: { ...(f.desde ? { gte: f.desde } : {}), ...(f.ate ? { lt: f.ate } : {}) } } : {}),
    ...(f.q ? { company_name: { contains: f.q, mode: 'insensitive' as const } } : {}),
  };
}

function leitura(db: Cliente): VouchersLeitura {
  return {
    async porId(id) {
      const r = await db.field_vouchers.findUnique({ where: { id } });
      return r ? paraVoucher(r) : null;
    },
    async porClientId(clientId) {
      const r = await db.field_vouchers.findUnique({ where: { client_id: clientId } });
      return r ? paraVoucher(r) : null;
    },
    async eventoPorClientId(clientId) {
      const r = await db.field_voucher_events.findUnique({ where: { client_id: clientId } });
      return r ? paraEvento(r) : null;
    },
    async eventos(voucherId) {
      const rows = await db.field_voucher_events.findMany({ where: { voucher_id: voucherId }, orderBy: [{ created_at: 'asc' }, { id: 'asc' }] });
      return rows.map(paraEvento);
    },
    async listar(f) {
      const rows = await db.field_vouchers.findMany({ where: onde(f), orderBy: [{ created_at: 'desc' }, { id: 'asc' }], take: f.limit ?? 500 });
      return rows.map(paraVoucher);
    },
    async contar(f) {
      const g = await db.field_vouchers.groupBy({ by: ['status', 'coupon_status'], where: onde(f), _count: { _all: true } });
      return g.map((x) => ({ status: x.status, coupon_status: x.coupon_status, n: x._count._all }));
    },
    async ativosDoLead(leadId) {
      const rows = await db.field_vouchers.findMany({
        where: { lead_id: leadId, status: { in: ['pendente', 'aprovado'] } },
        orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      });
      return rows.map(paraVoucher);
    },
    async comCupomDoContratante(contractorUserId, exceto) {
      const r = await db.field_vouchers.findFirst({
        where: {
          contractor_user_id: contractorUserId,
          id: { not: exceto },
          coupon_status: { in: ['aguardando_freela', 'criado', 'usado', 'vencido', 'desativado', 'erro'] },
        },
      });
      return r ? paraVoucher(r) : null;
    },
    async aguardandoFreela(limite) {
      const rows = await db.field_vouchers.findMany({
        where: { coupon_status: 'aguardando_freela' },
        orderBy: [{ coupon_last_attempt_at: { sort: 'asc', nulls: 'first' } }, { id: 'asc' }],
        take: limite,
      });
      return rows.map(paraVoucher);
    },
    async aguardandoVinculo(limite) {
      const rows = await db.field_vouchers.findMany({ where: { coupon_status: 'aguardando_vinculo' }, orderBy: [{ created_at: 'asc' }], take: limite });
      return rows.map(paraVoucher);
    },
    async comCupomAtivo() {
      const rows = await db.field_vouchers.findMany({ where: { coupon_status: { in: ['criado', 'usado'] } }, take: 5000 });
      return rows.map(paraVoucher);
    },
    async ultimaLeitura() {
      const a = await db.field_vouchers.aggregate({ _max: { coupon_synced_at: true }, where: { coupon_status: { in: ['criado', 'usado'] } } });
      return a._max.coupon_synced_at ?? null;
    },
    async nomesDosConsultores(ids) {
      if (!ids.length) return new Map();
      const rows = await db.field_consultants.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
      return new Map(rows.map((r) => [r.id, r.name]));
    },
    async visitaDoConsultor(consultantId, ref) {
      return db.field_visits.findFirst({
        where: { consultant_id: consultantId, OR: [{ id: ref }, { client_id: ref }] },
        select: { id: true, lead_id: true },
      });
    },
    async lead(id) {
      return db.leads.findUnique({ where: { id }, select: { id: true, name: true, city: true, praca_id: true } });
    },
    async praca(id) {
      return db.pracas.findUnique({ where: { id }, select: { city: true, cobertura_uf: true, cobertura_cidade: true } });
    },
    async contratanteDoCadastro(leadId) {
      const r = await db.field_company_signups.findFirst({
        where: { lead_id: leadId, freela_user_id: { not: null } },
        orderBy: { created_at: 'desc' },
        select: { freela_user_id: true },
      });
      return r?.freela_user_id ?? null;
    },
    async contratanteDoSync(leadId) {
      const r = await db.field_signups.findFirst({
        where: { lead_id: leadId, match_status: 'linked' },
        orderBy: { freela_created_at: 'desc' },
        select: { freela_user_id: true },
      });
      return r?.freela_user_id ?? null;
    },
    async lerConfig() {
      const s = await db.app_settings.findUnique({ where: { id: 1 }, select: { field_config: true } });
      const v = s?.field_config;
      return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>).voucher : undefined;
    },
  };
}

const json = (v: unknown) => (v === null || v === undefined ? Prisma.DbNull : (v as Prisma.InputJsonValue));

class VouchersTxPrisma implements VouchersTx {
  private readonly l: VouchersLeitura;
  constructor(private readonly tx: Prisma.TransactionClient) {
    this.l = leitura(tx);
  }
  porId = (id: string) => this.l.porId(id);
  porClientId = (c: string) => this.l.porClientId(c);
  eventoPorClientId = (c: string) => this.l.eventoPorClientId(c);
  eventos = (id: string) => this.l.eventos(id);
  listar = (f: FiltroVouchers) => this.l.listar(f);
  contar = (f: FiltroVouchers) => this.l.contar(f);
  ativosDoLead = (id: string) => this.l.ativosDoLead(id);
  comCupomDoContratante = (u: string, e: string) => this.l.comCupomDoContratante(u, e);
  aguardandoFreela = (n: number) => this.l.aguardandoFreela(n);
  aguardandoVinculo = (n: number) => this.l.aguardandoVinculo(n);
  comCupomAtivo = () => this.l.comCupomAtivo();
  ultimaLeitura = () => this.l.ultimaLeitura();
  nomesDosConsultores = (ids: string[]) => this.l.nomesDosConsultores(ids);
  visitaDoConsultor = (c: string, r: string) => this.l.visitaDoConsultor(c, r);
  lead = (id: string) => this.l.lead(id);
  praca = (id: string) => this.l.praca(id);
  contratanteDoCadastro = (id: string) => this.l.contratanteDoCadastro(id);
  contratanteDoSync = (id: string) => this.l.contratanteDoSync(id);
  lerConfig = () => this.l.lerConfig();

  inserirEvento = (voucherId: string, e: Omit<EventoVoucherNovo, 'voucher_id'>) => this.evento(voucherId, e);

  private async evento(voucherId: string, e: Omit<EventoVoucherNovo, 'voucher_id'>): Promise<void> {
    await this.tx.field_voucher_events.create({ data: { ...e, voucher_id: voucherId, data: e.data as Prisma.InputJsonValue } });
  }

  async criar(n: VoucherNovo, e: Omit<EventoVoucherNovo, 'voucher_id'>): Promise<VoucherRow> {
    const row = await this.tx.field_vouchers.create({ data: { ...n, status: 'pendente' } });
    await this.evento(row.id, e);
    return paraVoucher(row);
  }

  async transitar(
    id: string,
    de: CondicaoVoucher,
    mudanca: MudancaVoucher,
    e: Omit<EventoVoucherNovo, 'voucher_id'> | null,
  ): Promise<VoucherRow | null> {
    const { coupon_params, ...resto } = mudanca;
    const r = await this.tx.field_vouchers.updateMany({
      where: { id, ...de },
      data: { ...resto, ...(coupon_params !== undefined ? { coupon_params: json(coupon_params) } : {}) },
    });
    if (r.count === 0) return null;
    if (e) await this.evento(id, e);
    return paraVoucher(await this.tx.field_vouchers.findUniqueOrThrow({ where: { id } }));
  }

  async gravarConfig(cfg: Record<string, unknown>): Promise<void> {
    // Lido DENTRO da transação: preserva as chaves das outras fases (`field_config` é um JSON só).
    const s = await this.tx.app_settings.findUnique({ where: { id: 1 }, select: { field_config: true } });
    const raw = s?.field_config && typeof s.field_config === 'object' && !Array.isArray(s.field_config) ? (s.field_config as Record<string, unknown>) : {};
    const novo = { ...raw, voucher: cfg } as Prisma.InputJsonValue;
    await this.tx.app_settings.upsert({ where: { id: 1 }, update: { field_config: novo }, create: { id: 1, field_config: novo } });
  }
}

@Injectable()
export class PrismaVouchersRepository implements VouchersRepository {
  private readonly l: VouchersLeitura;
  constructor(private readonly prisma: PrismaService) {
    this.l = leitura(prisma);
  }
  porId = (id: string) => this.l.porId(id);
  porClientId = (c: string) => this.l.porClientId(c);
  eventoPorClientId = (c: string) => this.l.eventoPorClientId(c);
  eventos = (id: string) => this.l.eventos(id);
  listar = (f: FiltroVouchers) => this.l.listar(f);
  contar = (f: FiltroVouchers) => this.l.contar(f);
  ativosDoLead = (id: string) => this.l.ativosDoLead(id);
  comCupomDoContratante = (u: string, e: string) => this.l.comCupomDoContratante(u, e);
  aguardandoFreela = (n: number) => this.l.aguardandoFreela(n);
  aguardandoVinculo = (n: number) => this.l.aguardandoVinculo(n);
  comCupomAtivo = () => this.l.comCupomAtivo();
  ultimaLeitura = () => this.l.ultimaLeitura();
  nomesDosConsultores = (ids: string[]) => this.l.nomesDosConsultores(ids);
  visitaDoConsultor = (c: string, r: string) => this.l.visitaDoConsultor(c, r);
  lead = (id: string) => this.l.lead(id);
  praca = (id: string) => this.l.praca(id);
  contratanteDoCadastro = (id: string) => this.l.contratanteDoCadastro(id);
  contratanteDoSync = (id: string) => this.l.contratanteDoSync(id);
  lerConfig = () => this.l.lerConfig();

  async emTransacao<T>(chave: string, fn: (tx: VouchersTx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(
      async (client) => {
        await client.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${chave}))`;
        return fn(new VouchersTxPrisma(client));
      },
      { timeout: 20_000 },
    );
  }
}
