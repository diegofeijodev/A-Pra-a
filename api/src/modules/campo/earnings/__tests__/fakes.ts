import { randomUUID } from 'crypto';
import { chaveTrabalho, REGRA_PADRAO, type JaLancado, type RegraRemuneracao } from '../../../../domain/earnings-rules';
import type { RegraConfirmacao } from '../../../../domain/signup-sync-rules';
import type { ConsultorBasico, DiaBruto, EarningsInputs } from '../earnings-inputs';
import type {
  EarningsRepository,
  EarningsTx,
  FiltroLancamentos,
  LancamentoNovo,
  LancamentoRow,
  PeriodoNovo,
  PeriodoRow,
  VersaoNova,
  VersaoRegistrada,
} from '../earnings.repository';

export const A = 'aaaaaaaa-0000-4000-8000-000000000001';
export const B = 'bbbbbbbb-0000-4000-8000-000000000002';
export const PRACA_1 = 'cccccccc-0000-4000-8000-0000000000c1';
export const PRACA_2 = 'cccccccc-0000-4000-8000-0000000000c2';
/** Terça 2026-10-27, 10:00 em Brasília. Semana corrente: 2026-10-26; anterior: 2026-10-19..25. */
export const AGORA = new Date('2026-10-27T13:00:00.000Z');

export class ViolacaoUnica extends Error {}

/** Repositório em memória com as mesmas restrições do banco (UNIQUE) e lock por consultor. */
export class FakeRepo implements EarningsRepository {
  versions: VersaoRegistrada[] = [{ version: 1, valid_from: '1970-01-01', config: REGRA_PADRAO, reason: 'Padrão inicial', created_by_name: 'sistema', created_at: new Date('2026-10-01') }];
  ledger: LancamentoRow[] = [];
  periods: PeriodoRow[] = [];
  private tails = new Map<string, Promise<void>>();

  async versoes() {
    return [...this.versions].sort((a, b) => (a.valid_from === b.valid_from ? a.version - b.version : a.valid_from < b.valid_from ? -1 : 1));
  }
  async inserirVersao(v: VersaoNova) {
    const row: VersaoRegistrada = { version: this.versions.length + 1, valid_from: v.valid_from, config: v.config as unknown as RegraRemuneracao, reason: v.reason, created_by_name: v.created_by_name, created_at: new Date() };
    this.versions.push(row);
    return row;
  }
  async existeRazaoOuFechamento() {
    return this.ledger.length > 0 || this.periods.length > 0;
  }
  async primeiraSemanaPorConsultor(ids: string[]) {
    const out = new Map<string, string>();
    for (const p of this.periods) {
      if (ids.includes(p.consultant_id) && (!out.has(p.consultant_id) || p.week_start < (out.get(p.consultant_id) as string))) out.set(p.consultant_id, p.week_start);
    }
    return out;
  }
  async periodos(ids: string[], weeks: string[]) {
    return this.periods.filter((p) => ids.includes(p.consultant_id) && weeks.includes(p.week_start));
  }
  async lancamentos(ids: string[], f: FiltroLancamentos) {
    const rows = this.ledger
      .filter((l) => ids.includes(l.consultant_id))
      .filter((l) => !f.payout_week || l.payout_week === f.payout_week)
      .filter((l) => !f.work_weeks || f.work_weeks.includes(l.work_week))
      .filter((l) => !f.kind || l.kind === f.kind)
      .reverse();
    return f.limit ? rows.slice(0, f.limit) : rows;
  }
  async lancadoAccrual(ids: string[], weeks: string[]) {
    const out = new Map<string, Map<string, JaLancado>>(ids.map((id) => [id, new Map()]));
    for (const l of this.ledger) {
      if (l.kind !== 'accrual' || !ids.includes(l.consultant_id) || !weeks.includes(l.work_week)) continue;
      const m = out.get(l.consultant_id) as Map<string, JaLancado>;
      const k = chaveTrabalho(l.work_scope as 'day' | 'week', l.work_day, l.work_week);
      const cur = m.get(k) ?? { soma: 0, qtd: 0 };
      m.set(k, { soma: cur.soma + l.amount_cents, qtd: cur.qtd + 1 });
    }
    return out;
  }
  async lancamentoPorId(id: string) {
    return this.ledger.find((l) => l.id === id) ?? null;
  }
  async inserirLancamento(n: LancamentoNovo) {
    const dup = this.ledger.find((l) => l.consultant_id === n.consultant_id && l.kind === n.kind && l.idempotency_key === n.idempotency_key);
    if (dup) return { criado: false, row: dup };
    // UNIQUE(consultant_id, payout_week, kind, idempotency_key) e UNIQUE(reverses_id) do banco
    if (n.reverses_id && this.ledger.some((l) => l.reverses_id === n.reverses_id)) throw new ViolacaoUnica('reverses_id');
    const row: LancamentoRow = { ...n, id: randomUUID(), created_at: new Date() };
    this.ledger.push(row);
    return { criado: true, row };
  }
  async inserirPeriodo(p: PeriodoNovo) {
    const dup = this.periods.find((x) => x.consultant_id === p.consultant_id && x.week_start === p.week_start);
    if (dup) return { criado: false, row: dup };
    const row: PeriodoRow = { ...p, id: randomUUID(), status: 'closed' };
    this.periods.push(row);
    return { criado: true, row };
  }
  async emTransacao<T>(consultantId: string, fn: (tx: EarningsTx) => Promise<T>): Promise<T> {
    const prev = this.tails.get(consultantId) ?? Promise.resolve();
    let liberar!: () => void;
    const portao = new Promise<void>((r) => (liberar = r));
    this.tails.set(consultantId, prev.then(() => portao));
    await prev;
    try {
      return await fn(this);
    } finally {
      liberar();
    }
  }
}

export const consultor = (id: string, o: Partial<ConsultorBasico> = {}): ConsultorBasico => ({ id, name: id === A ? 'Ana' : 'Beto', praca_id: id === A ? PRACA_1 : PRACA_2, active: true, created_day: '2026-09-01', ...o });

export class FakeInputs implements EarningsInputs {
  lista: ConsultorBasico[] = [consultor(A), consultor(B)];
  dados = new Map<string, Map<string, DiaBruto>>();
  naoConf = new Map<string, number>();
  chamadas = { dias: [] as string[][] };

  set(id: string, dia: string, o: Partial<DiaBruto>) {
    const m = this.dados.get(id) ?? new Map<string, DiaBruto>();
    m.set(dia, { signups: 0, visits_checkin: 0, visits_checkout: 0, journey: false, ...(m.get(dia) ?? {}), ...o });
    this.dados.set(id, m);
  }
  async consultores(f: { ids?: string[]; praca_id?: string }) {
    return this.lista.filter((c) => (!f.ids || f.ids.includes(c.id)) && (!f.praca_id || c.praca_id === f.praca_id));
  }
  async dias(ids: string[], from: string, to: string, _regra: RegraConfirmacao) {
    this.chamadas.dias.push(ids);
    const out = new Map<string, Map<string, DiaBruto>>();
    for (const id of ids) {
      const m = new Map<string, DiaBruto>();
      for (const [d, v] of this.dados.get(id) ?? []) if (d >= from && d <= to) m.set(d, { ...v });
      out.set(id, m);
    }
    return out;
  }
  async naoConfirmados(ids: string[]) {
    return new Map(ids.map((id) => [id, this.naoConf.get(id) ?? 0]));
  }
}
