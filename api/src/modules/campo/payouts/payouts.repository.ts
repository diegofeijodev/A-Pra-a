/**
 * Persistência dos pagamentos Pix manuais (F9, contrato §29). Nada é apagado: o pagamento só muda de estado por
 * `transitar` (compare-and-set no status) e TODA mudança grava um evento na mesma transação. Eventos só recebem INSERT.
 * A transação usa o MESMO cliente e o MESMO advisory lock do razão da F8 (`EarningsTx`), então pagar, fechar e ajustar
 * nunca se intercalam por consultor.
 */
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../common/database/prisma.service';
import type { StatusPagamento, TipoEvento } from '../../../domain/payout-rules';
import { chaveDoLock, TxPrisma, type EarningsTx } from '../earnings/earnings.repository';

export interface PayoutNovo {
  consultant_id: string;
  week_start: string;
  week_end: string;
  due_cents: number;
  pix_key: string | null;
  pix_key_type: string | null;
  block_reason: 'NO_PIX_KEY' | null;
  created_by: string | null;
  created_by_name: string | null;
}

export interface PayoutRow extends PayoutNovo {
  id: string;
  status: StatusPagamento;
  paid_cents: number | null;
  paid_at: Date | null;
  paid_by: string | null;
  paid_by_name: string | null;
  method: 'pix_manual';
  proof_key: string | null;
  proof_mime: string | null;
  proof_size: number | null;
  note: string | null;
  diff_reason: string | null;
  created_at: Date;
}

export interface EventoNovo {
  payout_id: string;
  type: TipoEvento;
  from_status: StatusPagamento | null;
  to_status: StatusPagamento | null;
  actor_id: string | null;
  actor_name: string | null;
  reason: string | null;
  /** Nunca a chave Pix. */
  data: Record<string, unknown>;
}

export interface EventoRow extends EventoNovo {
  id: string;
  created_at: Date;
}

export interface FiltroPayouts {
  week_start?: string;
  consultant_ids?: string[];
  status?: StatusPagamento;
  /** Padrão: sem cancelados. */
  incluirCancelados?: boolean;
  limit?: number;
}

/** O que muda no pagamento numa transição (nada além disto pode mudar; o banco também barra). */
export interface MudancaPayout {
  paid_cents?: number | null;
  paid_at?: Date | null;
  paid_by?: string | null;
  paid_by_name?: string | null;
  proof_key?: string | null;
  proof_mime?: string | null;
  proof_size?: number | null;
  note?: string | null;
  diff_reason?: string | null;
}

export interface DadosConsultor {
  pix_key: string | null;
  pix_key_type: string | null;
  praca_name: string;
}

export interface PayoutsLeitura {
  listar(f: FiltroPayouts): Promise<PayoutRow[]>;
  porId(id: string): Promise<PayoutRow | null>;
  eventos(payoutId: string): Promise<EventoRow[]>;
  /** Último evento de cada pagamento (motivo de falha/cancelamento). */
  ultimosEventos(payoutIds: string[]): Promise<Map<string, EventoRow>>;
  /** Cadastro do consultor: chave Pix ATUAL (para gerar a fila) e nome da praça. */
  dadosDosConsultores(ids: string[]): Promise<Map<string, DadosConsultor>>;
  /** Consultores com pagamento bloqueado ou falho (cancelados fora), para "Atenção agora". */
  comProblema(): Promise<PayoutRow[]>;
}

export interface PayoutsTx extends PayoutsLeitura, EarningsTx {
  /** Cria o pagamento e o evento `created`. O UNIQUE parcial impede o duplicado. */
  criar(n: PayoutNovo, ator: { id: string | null; name: string }): Promise<PayoutRow>;
  /**
   * Compare-and-set: só muda se o status ainda é `de`. Devolve `null` se alguém chegou antes.
   * Grava o evento junto.
   */
  transitar(
    id: string,
    de: StatusPagamento,
    para: StatusPagamento,
    mudanca: MudancaPayout,
    evento: Omit<EventoNovo, 'payout_id' | 'from_status' | 'to_status'>,
  ): Promise<PayoutRow | null>;
  inserirEvento(e: EventoNovo): Promise<void>;
}

export interface PayoutsRepository extends PayoutsLeitura {
  emTransacao<T>(consultantId: string, fn: (tx: PayoutsTx) => Promise<T>): Promise<T>;
}

export const PAYOUTS_REPOSITORY = Symbol('PAYOUTS_REPOSITORY');

type Cliente = Prisma.TransactionClient | PrismaService;

function paraPayout(r: Record<string, any>): PayoutRow {
  return {
    id: r.id,
    consultant_id: r.consultant_id,
    week_start: r.week_start,
    week_end: r.week_end,
    due_cents: r.due_cents,
    pix_key: r.pix_key,
    pix_key_type: r.pix_key_type,
    block_reason: r.block_reason,
    status: r.status,
    paid_cents: r.paid_cents,
    paid_at: r.paid_at,
    paid_by: r.paid_by,
    paid_by_name: r.paid_by_name,
    method: r.method,
    proof_key: r.proof_key,
    proof_mime: r.proof_mime,
    proof_size: r.proof_size,
    note: r.note,
    diff_reason: r.diff_reason,
    created_by: r.created_by,
    created_by_name: r.created_by_name,
    created_at: r.created_at,
  };
}

function paraEvento(r: Record<string, any>): EventoRow {
  return {
    id: r.id,
    payout_id: r.payout_id,
    type: r.type,
    from_status: r.from_status,
    to_status: r.to_status,
    actor_id: r.actor_id,
    actor_name: r.actor_name,
    reason: r.reason,
    data: (r.data ?? {}) as Record<string, unknown>,
    created_at: r.created_at,
  };
}

function leitura(db: Cliente): PayoutsLeitura {
  return {
    async listar(f) {
      const rows = await db.field_payouts.findMany({
        where: {
          ...(f.week_start ? { week_start: f.week_start } : {}),
          ...(f.consultant_ids ? { consultant_id: { in: f.consultant_ids } } : {}),
          ...(f.status ? { status: f.status } : f.incluirCancelados ? {} : { status: { not: 'cancelled' } }),
        },
        orderBy: [{ week_start: 'desc' }, { created_at: 'asc' }, { id: 'asc' }],
        ...(f.limit ? { take: f.limit } : {}),
      });
      return rows.map(paraPayout);
    },
    async porId(id) {
      const r = await db.field_payouts.findUnique({ where: { id } });
      return r ? paraPayout(r) : null;
    },
    async eventos(payoutId) {
      const rows = await db.field_payout_events.findMany({
        where: { payout_id: payoutId },
        orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      });
      return rows.map(paraEvento);
    },
    async ultimosEventos(ids) {
      if (!ids.length) return new Map();
      const rows = await db.field_payout_events.findMany({
        where: { payout_id: { in: ids }, type: { in: ['failed', 'cancelled', 'reversed', 'paid', 'retried', 'created'] } },
        orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      });
      const out = new Map<string, EventoRow>();
      for (const r of rows) out.set(r.payout_id, paraEvento(r));
      return out;
    },
    async dadosDosConsultores(ids) {
      if (!ids.length) return new Map();
      const rows = await db.field_consultants.findMany({
        where: { id: { in: ids } },
        select: { id: true, pix_key: true, pix_key_type: true, praca: { select: { name: true } } },
      });
      return new Map(
        rows.map((r) => [r.id, { pix_key: r.pix_key, pix_key_type: r.pix_key_type, praca_name: r.praca.name }]),
      );
    },
    async comProblema() {
      const rows = await db.field_payouts.findMany({
        where: { OR: [{ status: 'failed' }, { status: 'pending', block_reason: { not: null } }] },
        orderBy: [{ week_start: 'desc' }, { id: 'asc' }],
        take: 200,
      });
      return rows.map(paraPayout);
    },
  };
}

class PayoutsTxPrisma extends TxPrisma implements PayoutsTx {
  private readonly l: PayoutsLeitura;
  constructor(tx: Prisma.TransactionClient) {
    super(tx);
    this.l = leitura(tx);
  }
  listar = (f: FiltroPayouts) => this.l.listar(f);
  porId = (id: string) => this.l.porId(id);
  eventos = (id: string) => this.l.eventos(id);
  ultimosEventos = (ids: string[]) => this.l.ultimosEventos(ids);
  dadosDosConsultores = (ids: string[]) => this.l.dadosDosConsultores(ids);
  comProblema = () => this.l.comProblema();

  async inserirEvento(e: EventoNovo): Promise<void> {
    await this.tx.field_payout_events.create({ data: { ...e, data: e.data as Prisma.InputJsonValue } });
  }

  async criar(n: PayoutNovo, ator: { id: string | null; name: string }): Promise<PayoutRow> {
    const row = await this.tx.field_payouts.create({ data: { ...n, status: 'pending' } });
    await this.inserirEvento({
      payout_id: row.id,
      type: 'created',
      from_status: null,
      to_status: 'pending',
      actor_id: ator.id,
      actor_name: ator.name,
      reason: n.block_reason ? 'Bloqueado: falta a chave Pix' : null,
      data: { due_cents: n.due_cents, week_start: n.week_start, blocked: n.block_reason !== null },
    });
    return paraPayout(row);
  }

  async transitar(
    id: string,
    de: StatusPagamento,
    para: StatusPagamento,
    mudanca: MudancaPayout,
    evento: Omit<EventoNovo, 'payout_id' | 'from_status' | 'to_status'>,
  ): Promise<PayoutRow | null> {
    const r = await this.tx.field_payouts.updateMany({
      where: { id, status: de },
      data: { ...mudanca, status: para },
    });
    if (r.count === 0) return null;
    await this.inserirEvento({ ...evento, payout_id: id, from_status: de, to_status: para });
    const row = await this.tx.field_payouts.findUniqueOrThrow({ where: { id } });
    return paraPayout(row);
  }
}

@Injectable()
export class PrismaPayoutsRepository implements PayoutsRepository {
  private readonly l: PayoutsLeitura;
  constructor(private readonly prisma: PrismaService) {
    this.l = leitura(prisma);
  }
  listar = (f: FiltroPayouts) => this.l.listar(f);
  porId = (id: string) => this.l.porId(id);
  eventos = (id: string) => this.l.eventos(id);
  ultimosEventos = (ids: string[]) => this.l.ultimosEventos(ids);
  dadosDosConsultores = (ids: string[]) => this.l.dadosDosConsultores(ids);
  comProblema = () => this.l.comProblema();

  async emTransacao<T>(consultantId: string, fn: (tx: PayoutsTx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(
      async (client) => {
        await client.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${chaveDoLock(consultantId)}))`;
        return fn(new PayoutsTxPrisma(client));
      },
      { timeout: 20_000 },
    );
  }
}
