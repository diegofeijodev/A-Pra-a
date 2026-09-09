import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { isUuid } from '../../common/ids/uuid';
import { todaySp } from '../../common/time/dates';
import {
  IND_CATALOG,
  MILESTONES,
  type IndDef,
  type IndDir,
  type IndKey,
} from '../../domain/catalog/indicators';
import {
  activeByMonth,
  canalRows,
  computeValue,
  milestonePct,
  periodRange,
  personRows,
  pracaRows,
  readIndicator,
  whatChanged,
  type IndCanalRowView,
  type IndChange,
  type IndData,
  type IndPersonRowView,
  type IndPracaRowView,
  type IndRange,
  type IndReading,
  type MonthPoint,
  type Sem,
} from '../../domain/indicator-rules';
import { recFromRow } from '../../domain/recurrence';
import {
  CanaisQueryDto,
  EntryKeyQueryDto,
  IndicatorEntryDto,
  PERIOD_DEFAULT,
  PeriodQueryDto,
  ReadingsQueryDto,
} from './dto/indicators.dto';

// ── views ──────────────────────────────────────────────────────
export interface RangeView {
  from: string;
  to: string;
  label: string;
}

/** Uma linha da lista completa de indicadores. */
export interface IndReadingView {
  key: IndKey;
  name: string;
  what: string;
  meta: number;
  meta_label: string;
  unit: string;
  dir: IndDir;
  freq: string;
  /** Dono resolvido do `owner_email` do catálogo; `null` se a conta não existe. */
  owner_id: string | null;
  source: string;
  origem: string;
  hero: boolean;
  value: number | null;
  prev: number | null;
  delta: number | null;
  sem: Sem;
  stale: boolean;
  last_at: string | null;
  history: { date: string; value: number }[];
}

export interface ReadingsView {
  range: RangeView;
  readings: IndReadingView[];
}

export interface MilestoneTargetView {
  name: string;
  meta: number;
  unit: string;
  key: IndKey;
  dir: IndDir;
  value: number | null;
  pct: number;
}

export interface MilestoneView {
  when: string;
  label: string;
  targets: MilestoneTargetView[];
}

export interface EmpresaView {
  range: RangeView;
  heroes: IndReadingView[];
  milestones: MilestoneView[];
  months: MonthPoint[];
  changed: { good: IndChange[]; bad: IndChange[] };
}

export interface IndicatorEntryView {
  praca_id: string;
  key: IndKey;
  date: string;
  value: number;
}

/** Quantos meses o gráfico de clientes ativos mostra. */
const MONTHS = 12;

@Injectable()
export class IndicatorsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── rotas ────────────────────────────────────────────────────
  /** As 12 leituras — empresa (todas as praças) ou uma praça só. */
  async readings(query: ReadingsQueryDto): Promise<ReadingsView> {
    const pracaId = query.scope === 'praca' ? await this.pracaOrFail(query.praca_id) : null;
    const { range, today } = this.rangeOf(query);
    const data = await this.loadData(pracaId);
    const owners = this.ownersOf(data);
    return {
      range,
      readings: IND_CATALOG.map((def) =>
        this.toReadingView(readIndicator(def, data, pracaId, range, today), owners),
      ),
    };
  }

  /** Visão Empresa: os 6 números grandes, os marcos, os 12 meses e o que mudou. */
  async empresa(query: PeriodQueryDto): Promise<EmpresaView> {
    const { range, today } = this.rangeOf(query);
    const data = await this.loadData(null);
    const owners = this.ownersOf(data);
    const valueOf = (key: IndKey): number | null => {
      const def = this.defOrFail(key);
      // `freelancers` é lançado à mão: só `readIndicator` conhece a reserva da
      // etapa 2 e a junção das praças. O resto o sistema calcula.
      return def.source === 'manual'
        ? readIndicator(def, data, null, range, today).value
        : computeValue(key, data, null, range);
    };

    return {
      range,
      heroes: IND_CATALOG.filter((d) => d.hero).map((def) =>
        this.toReadingView(readIndicator(def, data, null, range, today), owners),
      ),
      milestones: MILESTONES.map((m) => ({
        when: m.when,
        label: m.label,
        targets: m.targets.map((t) => {
          const value = valueOf(t.key);
          return { ...t, value, pct: milestonePct(value, t.meta, t.dir) };
        }),
      })),
      months: activeByMonth(data, null, MONTHS, today),
      changed: whatChanged(data, null, today),
    };
  }

  /** Uma linha por praça — a tabela da visão Praça. */
  async pracas(query: PeriodQueryDto): Promise<IndPracaRowView[]> {
    const { range, today } = this.rangeOf(query);
    return pracaRows(await this.loadData(null), range, today);
  }

  /** Uma linha por pessoa ATIVA — a conversa individual, não ranking. */
  async pessoas(query: PeriodQueryDto): Promise<IndPersonRowView[]> {
    const { range, today } = this.rangeOf(query);
    return personRows(await this.loadData(null), range, today);
  }

  /** Os 6 canais de entrada de lead de uma praça. */
  async canais(query: CanaisQueryDto): Promise<IndCanalRowView[]> {
    const pracaId = await this.pracaOrFail(query.praca_id);
    const { range } = this.rangeOf(query);
    return canalRows(await this.loadData(pracaId), pracaId, range);
  }

  /** Lançamento à mão de um dia (o "+" da lista completa). Regrava o mesmo dia. */
  async putEntry(key: string, dto: IndicatorEntryDto): Promise<IndicatorEntryView> {
    const def = this.defOrFail(key);
    const praca_id = await this.pracaOrFail(dto.praca_id);
    const row = await this.prisma.indicator_entries.upsert({
      where: { praca_id_key_date: { praca_id, key: def.key, date: dto.date } },
      update: { value: dto.value },
      create: { praca_id, key: def.key, date: dto.date, value: dto.value },
    });
    return { praca_id: row.praca_id, key: def.key, date: row.date, value: row.value };
  }

  /** Apaga um lançamento. Dia sem lançamento também responde `{ok: true}`. */
  async removeEntry(key: string, query: EntryKeyQueryDto): Promise<{ ok: true }> {
    const def = this.defOrFail(key);
    const praca_id = await this.pracaOrFail(query.praca_id);
    await this.prisma.indicator_entries.deleteMany({
      where: { praca_id, key: def.key, date: query.date },
    });
    return { ok: true };
  }

  // ── período ──────────────────────────────────────────────────
  private rangeOf(query: PeriodQueryDto): { range: IndRange; today: string } {
    const today = todaySp();
    const period = query.period ?? PERIOD_DEFAULT;
    const range = periodRange(period, { from: query.from, to: query.to }, today);
    if (range.from > range.to) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'O início do período não pode ser depois do fim.',
      });
    }
    return { range, today };
  }

  // ── o retrato ────────────────────────────────────────────────
  /**
   * UMA leitura do banco por requisição: as funções puras de
   * `indicator-rules.ts` recebem o retrato inteiro e não voltam ao Prisma.
   *
   * `pracaId` estreita o que dá para estreitar (leads, ações, campanhas,
   * lançamentos, envios); `null` (visão Empresa) traz tudo. Lead de teste e
   * lead arquivado ficam SEMPRE de fora — número de operação não pode contar
   * simulação nem casa que saiu da base.
   */
  private async loadData(pracaId: string | null): Promise<IndData> {
    const doPraca = pracaId ? { praca_id: pracaId } : {};
    const [leads, campanhas, traffic, actions, pracas, sends, entries, users] = await Promise.all([
      this.prisma.leads.findMany({
        where: { archived: false, is_test: false, ...doPraca },
        select: {
          id: true,
          praca_id: true,
          owner_id: true,
          origem: true,
          stage: true,
          entered_at: true,
          stage_since: true,
          events: { select: { kind: true, at: true, stage_to: true } },
          vagas: { select: { date: true, filled: true, hours: true } },
        },
      }),
      this.prisma.campanhas.findMany({
        where: doPraca,
        select: { id: true, praca_id: true, gasto: true },
      }),
      this.prisma.traffic_entries.findMany({
        where: pracaId ? { campanha: { praca_id: pracaId } } : {},
        select: { id: true, campanha_id: true, days: { select: { date: true, investido: true } } },
      }),
      this.prisma.actions.findMany({
        where: doPraca,
        select: {
          praca_id: true,
          step: true,
          owners: true,
          rec_kind: true,
          rec_day: true,
          rec_start_day: true,
          rec_end_day: true,
          rec_weekday: true,
          rec_month_day: true,
          due_override: true,
          completed_at: true,
          completions: { select: { date: true, at: true } },
        },
      }),
      this.prisma.pracas.findMany({
        where: pracaId ? { id: pracaId } : {},
        select: {
          id: true,
          name: true,
          start_date: true,
          step_states: { select: { step_n: true, actual: true } },
        },
        orderBy: { created_at: 'asc' },
      }),
      // Diferença do protótipo: lá o envio não sabia de que praça era (o store
      // era um objeto só). Aqui `msg_sends` → `leads` → `praca_id`, então a
      // taxa de resposta da praça é da praça mesmo.
      this.prisma.msg_sends.findMany({
        where: { lead: { is_test: false, ...doPraca } },
        select: { status: true, scheduled_at: true, sent_at: true, replied_at: true },
      }),
      this.prisma.indicator_entries.findMany({ where: doPraca }),
      this.prisma.users.findMany({
        where: { active: true },
        select: { id: true, name: true, email: true },
        orderBy: [{ sort: 'asc' }, { created_at: 'asc' }],
      }),
    ]);

    const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);
    return {
      leads: leads.map((l) => ({
        ...l,
        events: l.events.map((e) => ({ kind: e.kind, at: e.at.toISOString(), stage_to: e.stage_to })),
      })),
      campanhas,
      traffic: traffic.map((t) => ({ id: t.id, campanha_id: t.campanha_id })),
      days: traffic.flatMap((t) =>
        t.days.map((d) => ({ entry_id: t.id, date: d.date, investido: d.investido })),
      ),
      actions: actions.map((a) => ({
        praca_id: a.praca_id,
        step: a.step,
        owners: a.owners,
        rec: recFromRow(a),
        due_override: a.due_override,
        completed_at: iso(a.completed_at),
        completions: a.completions.map((c) => ({ date: c.date, at: c.at.toISOString() })),
      })),
      pracas: pracas.map((p) => ({
        id: p.id,
        name: p.name,
        start_date: p.start_date,
        steps: Object.fromEntries(p.step_states.map((s) => [s.step_n, { actual: s.actual }])),
      })),
      sends: sends.map((s) => ({
        status: s.status,
        scheduled_at: s.scheduled_at.toISOString(),
        sent_at: iso(s.sent_at),
        replied_at: iso(s.replied_at),
      })),
      entries: entries.map((e) => ({
        praca_id: e.praca_id,
        key: e.key,
        date: e.date,
        value: e.value,
      })),
      users,
    };
  }

  // ── auxiliares ───────────────────────────────────────────────
  /** `owner_email` do catálogo → id da conta (numa consulta só, já no retrato). */
  private ownersOf(data: IndData): Map<string, string> {
    return new Map(data.users.map((u) => [u.email.toLowerCase(), u.id]));
  }

  private toReadingView(r: IndReading, owners: Map<string, string>): IndReadingView {
    const d = r.def;
    return {
      key: d.key,
      name: d.name,
      what: d.what,
      meta: d.meta,
      meta_label: d.meta_label,
      unit: d.unit,
      dir: d.dir,
      freq: d.freq,
      owner_id: owners.get(d.owner_email) ?? null,
      source: d.source,
      origem: d.origem,
      hero: d.hero === true,
      value: r.value,
      prev: r.prev,
      delta: r.delta,
      sem: r.sem,
      stale: r.stale,
      last_at: r.last_at,
      history: r.history,
    };
  }

  private defOrFail(key: string): IndDef {
    const def = IND_CATALOG.find((d) => d.key === key);
    if (!def) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Indicador não encontrado.' });
    }
    return def;
  }

  /** Id de praça da URL/query: malformado ou inexistente → 404, nunca 500. */
  private async pracaOrFail(id: string | undefined): Promise<string> {
    if (!isUuid(id)) throw this.pracaNaoAchada();
    const praca = await this.prisma.pracas.findUnique({ where: { id }, select: { id: true } });
    if (!praca) throw this.pracaNaoAchada();
    return praca.id;
  }

  private pracaNaoAchada(): NotFoundException {
    return new NotFoundException({ code: 'NOT_FOUND', message: 'Praça não encontrada.' });
  }
}
