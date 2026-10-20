/**
 * Persistência da remuneração (F8, contrato §28). O razão é APPEND-ONLY: este repositório só expõe
 * INSERT e leitura de `field_earnings_ledger`, `field_pay_rule_versions` e `field_payout_periods`.
 * Não existe — nem pode existir — método de update/delete (há teste que varre o código-fonte e um trigger no banco).
 */
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../common/database/prisma.service';
import { chaveTrabalho, lerRegraSalva, type JaLancado, type VersaoRegra } from '../../../domain/earnings-rules';

export type TipoLancamento = 'accrual' | 'adjustment' | 'reversal';
export type EscopoLancamento = 'day' | 'week' | 'manual';

export interface LancamentoNovo {
  consultant_id: string;
  kind: TipoLancamento;
  amount_cents: number;
  work_scope: EscopoLancamento;
  work_day: string | null;
  work_week: string;
  payout_week: string;
  rule_version: number | null;
  source: string;
  reason: string | null;
  reverses_id: string | null;
  idempotency_key: string;
  snapshot: Record<string, unknown>;
  created_by: string | null;
  created_by_name: string | null;
}

export interface LancamentoRow extends LancamentoNovo {
  id: string;
  created_at: Date;
}

export interface PeriodoNovo {
  consultant_id: string;
  week_start: string;
  week_end: string;
  total_cents: number;
  entries: number;
  rule_version: number;
  closed_at: Date;
  closed_by: string | null;
  closed_by_name: string | null;
  closed_mode: 'manual' | 'auto';
}

export interface PeriodoRow extends PeriodoNovo {
  id: string;
  status: 'open' | 'closed';
}

export interface VersaoNova {
  valid_from: string;
  config: Record<string, unknown>;
  reason: string | null;
  created_by: string | null;
  created_by_name: string | null;
}

/** Versão da regra como foi registrada (com autoria), para a tela de configuração. */
export interface VersaoRegistrada extends VersaoRegra {
  reason: string | null;
  created_by_name: string | null;
  created_at: Date;
}

export interface FiltroLancamentos {
  payout_week?: string;
  work_weeks?: string[];
  kind?: TipoLancamento;
  limit?: number;
}

/** Leituras (sem transação). */
export interface EarningsLeitura {
  versoes(): Promise<VersaoRegistrada[]>;
  existeRazaoOuFechamento(): Promise<boolean>;
  /** Menor `week_start` com fechamento de CADA consultor (quem nunca fechou não aparece). */
  primeiraSemanaPorConsultor(consultantIds: string[]): Promise<Map<string, string>>;
  periodos(consultantIds: string[], weeks: string[]): Promise<PeriodoRow[]>;
  lancamentos(consultantIds: string[], filtro: FiltroLancamentos): Promise<LancamentoRow[]>;
  /** Soma e contagem dos `accrual` (e SÓ eles) por período de trabalho: chave `chaveTrabalho`. */
  lancadoAccrual(consultantIds: string[], workWeeks: string[]): Promise<Map<string, Map<string, JaLancado>>>;
  lancamentoPorId(id: string): Promise<LancamentoRow | null>;
}

/** Dentro da transação, já com o consultor travado. */
export interface EarningsTx extends EarningsLeitura {
  /** Se já existe `(consultor, kind, idempotency_key)` devolve o existente com `criado: false`. */
  inserirLancamento(n: LancamentoNovo): Promise<{ criado: boolean; row: LancamentoRow }>;
  /** Se a semana já está fechada devolve o fechamento existente com `criado: false`. */
  inserirPeriodo(p: PeriodoNovo): Promise<{ criado: boolean; row: PeriodoRow }>;
}

export interface EarningsRepository extends EarningsLeitura {
  inserirVersao(v: VersaoNova): Promise<VersaoRegistrada>;
  /** Serializa por consultor (advisory lock da transação). */
  emTransacao<T>(consultantId: string, fn: (tx: EarningsTx) => Promise<T>): Promise<T>;
}

export const EARNINGS_REPOSITORY = Symbol('EARNINGS_REPOSITORY');

type Cliente = Prisma.TransactionClient | PrismaService;

function paraLancamento(r: Record<string, any>): LancamentoRow {
  return {
    id: r.id,
    consultant_id: r.consultant_id,
    kind: r.kind,
    amount_cents: r.amount_cents,
    work_scope: r.work_scope,
    work_day: r.work_day,
    work_week: r.work_week,
    payout_week: r.payout_week,
    rule_version: r.rule_version,
    source: r.source,
    reason: r.reason,
    reverses_id: r.reverses_id,
    idempotency_key: r.idempotency_key,
    snapshot: (r.snapshot ?? {}) as Record<string, unknown>,
    created_by: r.created_by,
    created_by_name: r.created_by_name,
    created_at: r.created_at,
  };
}

function paraPeriodo(r: Record<string, any>): PeriodoRow {
  return {
    id: r.id,
    consultant_id: r.consultant_id,
    week_start: r.week_start,
    week_end: r.week_end,
    status: r.status,
    total_cents: r.total_cents,
    entries: r.entries,
    rule_version: r.rule_version,
    closed_at: r.closed_at,
    closed_by: r.closed_by,
    closed_by_name: r.closed_by_name,
    closed_mode: r.closed_mode,
  };
}

function paraVersao(r: Record<string, any>): VersaoRegistrada {
  return { version: r.version, valid_from: r.valid_from, config: lerRegraSalva(r.config), reason: r.reason, created_by_name: r.created_by_name, created_at: r.created_at };
}

class Leitor implements EarningsLeitura {
  constructor(protected readonly db: Cliente) {}

  async versoes(): Promise<VersaoRegistrada[]> {
    const rows = await this.db.field_pay_rule_versions.findMany({ orderBy: [{ valid_from: 'asc' }, { version: 'asc' }] });
    return rows.map(paraVersao);
  }

  async existeRazaoOuFechamento(): Promise<boolean> {
    const [l, p] = await Promise.all([
      this.db.field_earnings_ledger.findFirst({ select: { id: true } }),
      this.db.field_payout_periods.findFirst({ select: { id: true } }),
    ]);
    return !!l || !!p;
  }

  async primeiraSemanaPorConsultor(consultantIds: string[]): Promise<Map<string, string>> {
    if (!consultantIds.length) return new Map();
    const g = await this.db.field_payout_periods.groupBy({ by: ['consultant_id'], where: { consultant_id: { in: consultantIds } }, _min: { week_start: true } });
    return new Map(g.flatMap((r) => (r._min.week_start ? [[r.consultant_id, r._min.week_start] as const] : [])));
  }

  async periodos(consultantIds: string[], weeks: string[]): Promise<PeriodoRow[]> {
    if (!consultantIds.length || !weeks.length) return [];
    const rows = await this.db.field_payout_periods.findMany({ where: { consultant_id: { in: consultantIds }, week_start: { in: weeks } } });
    return rows.map(paraPeriodo);
  }

  async lancamentos(consultantIds: string[], f: FiltroLancamentos): Promise<LancamentoRow[]> {
    if (!consultantIds.length) return [];
    const rows = await this.db.field_earnings_ledger.findMany({
      where: {
        consultant_id: { in: consultantIds },
        ...(f.payout_week ? { payout_week: f.payout_week } : {}),
        ...(f.work_weeks ? { work_week: { in: f.work_weeks } } : {}),
        ...(f.kind ? { kind: f.kind } : {}),
      },
      orderBy: [{ created_at: 'desc' }, { id: 'asc' }],
      ...(f.limit ? { take: f.limit } : {}),
    });
    return rows.map(paraLancamento);
  }

  async lancadoAccrual(consultantIds: string[], workWeeks: string[]): Promise<Map<string, Map<string, JaLancado>>> {
    const out = new Map<string, Map<string, JaLancado>>(consultantIds.map((id) => [id, new Map()]));
    if (!consultantIds.length || !workWeeks.length) return out;
    const g = await this.db.field_earnings_ledger.groupBy({
      by: ['consultant_id', 'work_scope', 'work_day', 'work_week'],
      where: { consultant_id: { in: consultantIds }, kind: 'accrual', work_week: { in: workWeeks } },
      _sum: { amount_cents: true },
      _count: { _all: true },
    });
    for (const r of g) {
      const k = chaveTrabalho(r.work_scope as 'day' | 'week', r.work_day, r.work_week);
      out.get(r.consultant_id)?.set(k, { soma: r._sum.amount_cents ?? 0, qtd: r._count._all });
    }
    return out;
  }

  async lancamentoPorId(id: string): Promise<LancamentoRow | null> {
    const r = await this.db.field_earnings_ledger.findUnique({ where: { id } });
    return r ? paraLancamento(r) : null;
  }
}

class TxPrisma extends Leitor implements EarningsTx {
  constructor(private readonly tx: Prisma.TransactionClient) {
    super(tx);
  }

  async inserirLancamento(n: LancamentoNovo): Promise<{ criado: boolean; row: LancamentoRow }> {
    // Dentro do advisory lock do consultor não há corrida; o lookup evita abortar a transação com P2002.
    const existente = await this.tx.field_earnings_ledger.findFirst({ where: { consultant_id: n.consultant_id, kind: n.kind, idempotency_key: n.idempotency_key } });
    if (existente) return { criado: false, row: paraLancamento(existente) };
    const row = await this.tx.field_earnings_ledger.create({ data: { ...n, snapshot: n.snapshot as Prisma.InputJsonValue } });
    return { criado: true, row: paraLancamento(row) };
  }

  async inserirPeriodo(p: PeriodoNovo): Promise<{ criado: boolean; row: PeriodoRow }> {
    const existente = await this.tx.field_payout_periods.findUnique({ where: { consultant_id_week_start: { consultant_id: p.consultant_id, week_start: p.week_start } } });
    if (existente) return { criado: false, row: paraPeriodo(existente) };
    const row = await this.tx.field_payout_periods.create({ data: { ...p, status: 'closed' } });
    return { criado: true, row: paraPeriodo(row) };
  }
}

@Injectable()
export class PrismaEarningsRepository extends Leitor implements EarningsRepository {
  constructor(private readonly prisma: PrismaService) {
    super(prisma);
  }

  async inserirVersao(v: VersaoNova): Promise<VersaoRegistrada> {
    const r = await this.prisma.field_pay_rule_versions.create({ data: { ...v, config: v.config as Prisma.InputJsonValue } });
    return paraVersao(r);
  }

  async emTransacao<T>(consultantId: string, fn: (tx: EarningsTx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(
      async (client) => {
        await client.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'field_earnings:' + consultantId}))`;
        return fn(new TxPrisma(client));
      },
      { timeout: 20_000 },
    );
  }
}
