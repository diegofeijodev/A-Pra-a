// Recorrência das ações do roteiro-modelo e estado das etapas — porta literal
// de `.prototype/src/lib/praca/store.tsx:26-102`. Módulo PURO: sem Nest, sem
// Prisma, sem relógio (a data de "hoje" sempre entra por parâmetro).
//
// A recorrência mora no banco espalhada em colunas `rec_*`
// (`template_actions` e `actions`, mesmo conjunto de colunas); no wire ela
// volta a ser o objeto `rec` do protótipo, em snake_case.
import { addDays, monthDayOf, weekdayOf } from '../common/time/dates';
import { GATED_BY, STEPS, type StepBlock, type StepGate } from './catalog';

export type Rec =
  | { kind: 'once'; day: number }
  | { kind: 'daily' | 'weekday'; start_day: number; end_day?: number }
  | { kind: 'weekly'; weekday: number; start_day: number; end_day?: number }
  | { kind: 'monthly'; month_day: number; start_day: number };

export const REC_KINDS = ['once', 'daily', 'weekday', 'weekly', 'monthly'] as const;

/** Colunas `rec_*` de `actions`/`template_actions`. */
export interface RecRow {
  rec_kind: string;
  rec_day: number | null;
  rec_start_day: number | null;
  rec_end_day: number | null;
  rec_weekday: number | null;
  rec_month_day: number | null;
}

const VAZIO: Omit<RecRow, 'rec_kind'> = {
  rec_day: null,
  rec_start_day: null,
  rec_end_day: null,
  rec_weekday: null,
  rec_month_day: null,
};

export function recToRow(rec: Rec): RecRow {
  switch (rec.kind) {
    case 'once':
      return { ...VAZIO, rec_kind: 'once', rec_day: rec.day };
    case 'daily':
    case 'weekday':
      return {
        ...VAZIO,
        rec_kind: rec.kind,
        rec_start_day: rec.start_day,
        rec_end_day: rec.end_day ?? null,
      };
    case 'weekly':
      return {
        ...VAZIO,
        rec_kind: 'weekly',
        rec_weekday: rec.weekday,
        rec_start_day: rec.start_day,
        rec_end_day: rec.end_day ?? null,
      };
    case 'monthly':
      return {
        ...VAZIO,
        rec_kind: 'monthly',
        rec_month_day: rec.month_day,
        rec_start_day: rec.start_day,
      };
  }
}

export function recFromRow(row: RecRow): Rec {
  switch (row.rec_kind) {
    case 'once':
      return { kind: 'once', day: row.rec_day ?? 0 };
    case 'weekly':
      return {
        kind: 'weekly',
        weekday: row.rec_weekday ?? 0,
        start_day: row.rec_start_day ?? 0,
        // `end_day` ausente é ausente mesmo: `undefined` some do JSON e o
        // `"end_day" in rec` de `occursOn` continua valendo.
        ...(row.rec_end_day == null ? {} : { end_day: row.rec_end_day }),
      };
    case 'monthly':
      return { kind: 'monthly', month_day: row.rec_month_day ?? 1, start_day: row.rec_start_day ?? 0 };
    case 'daily':
    case 'weekday':
    default:
      return {
        kind: row.rec_kind === 'weekday' ? 'weekday' : 'daily',
        start_day: row.rec_start_day ?? 0,
        ...(row.rec_end_day == null ? {} : { end_day: row.rec_end_day }),
      };
  }
}

/** Objeto `rec` como chega do wire (todos os campos opcionais). */
export interface RecInput {
  kind: string;
  day?: number;
  start_day?: number;
  end_day?: number;
  weekday?: number;
  month_day?: number;
}

/**
 * Valida o `rec` do wire contra o `kind`: cada tipo exige os seus campos.
 * Devolve `null` quando falta campo — quem chama transforma em
 * `400 VALIDATION_ERROR` (a mensagem em pt-BR fica no serviço).
 */
export function parseRec(input: RecInput): Rec | null {
  const { kind } = input;
  if (kind === 'once') return input.day == null ? null : { kind: 'once', day: input.day };
  if (input.start_day == null) return null;
  if (kind === 'daily' || kind === 'weekday') {
    return { kind, start_day: input.start_day, ...(input.end_day == null ? {} : { end_day: input.end_day }) };
  }
  if (kind === 'weekly') {
    if (input.weekday == null) return null;
    return {
      kind: 'weekly',
      weekday: input.weekday,
      start_day: input.start_day,
      ...(input.end_day == null ? {} : { end_day: input.end_day }),
    };
  }
  if (kind === 'monthly') {
    if (input.month_day == null) return null;
    return { kind: 'monthly', month_day: input.month_day, start_day: input.start_day };
  }
  return null;
}

// ── ações ─────────────────────────────────────────────────────
export interface Completion {
  by: string;
  at: string;
  result?: number | null;
}

/** O mínimo de uma ação para as regras de recorrência (o resto da linha não importa). */
export interface RecAction {
  step: number;
  rec: Rec;
  due_override?: string | null;
  completed_at?: Date | string | null;
  completions?: Record<string, Completion>;
}

export interface RecPraca {
  start_date: string;
}

/** Dia devido de uma ação `once` ("" para recorrente) — `store.tsx:27-28`. */
export const dueDateOf = (a: RecAction, p: RecPraca): string =>
  a.rec.kind === 'once' ? (a.due_override ?? addDays(p.start_date, a.rec.day)) : '';

/**
 * A ação cai neste dia? Porta literal de `store.tsx:30-42`, inclusive a regra
 * das **ações fixas** (`step === 0`): elas rolam todo dia, mesmo antes do
 * início da praça — mas ainda respeitam o `end_day`, como no protótipo.
 */
export function occursOn(a: RecAction, p: RecPraca, date: string): boolean {
  if (a.rec.kind === 'once') return dueDateOf(a, p) === date;
  const start = addDays(p.start_date, a.rec.start_day);
  if (a.step !== 0 && date < start) return false;
  if ('end_day' in a.rec && a.rec.end_day != null && date > addDays(p.start_date, a.rec.end_day)) {
    return false;
  }
  const wd = weekdayOf(date);
  switch (a.rec.kind) {
    case 'daily':
      return true;
    case 'weekday':
      return wd >= 1 && wd <= 5;
    case 'weekly':
      return wd === a.rec.weekday;
    case 'monthly':
      return monthDayOf(date) === a.rec.month_day;
  }
}

export const isDoneOn = (a: RecAction, date: string): boolean =>
  a.rec.kind === 'once' ? !!a.completed_at : !!a.completions?.[date];

export const actionEverDone = (a: RecAction): boolean =>
  a.rec.kind === 'once' ? !!a.completed_at : Object.keys(a.completions ?? {}).length > 0;

const WD_LONG = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

/** "YYYY-MM-DD" → "dd/mm/aaaa" (`store-dates.ts:11-15`). */
export const fmtBr = (date?: string | null): string => {
  if (!date) return '—';
  const [y, m, d] = date.split('-');
  return `${d}/${m}/${y}`;
};

/** Rótulo de apresentação da recorrência — `store.tsx:50-59`. */
export function recLabel(a: RecAction, p: RecPraca): string {
  const r = a.rec;
  switch (r.kind) {
    case 'once':
      return fmtBr(dueDateOf(a, p));
    case 'daily':
      return 'todo dia';
    case 'weekday':
      return 'dia útil';
    case 'weekly':
      return `toda ${WD_LONG[r.weekday]}`;
    case 'monthly':
      return `todo dia ${r.month_day}`;
  }
}

// ── etapas ────────────────────────────────────────────────────
export interface StepStateInput {
  actual?: number | null;
  unlock?: { by: string; at: string; reason: string } | null;
}

export interface StepPraca extends RecPraca {
  steps: Record<number, StepStateInput | undefined>;
}

export type StepStatus = 'locked' | 'done' | 'active' | 'todo';

/** Uma etapa já resolvida para o wire (`StepInfoView` do contrato §6). */
export interface StepInfo {
  n: number;
  name: string;
  block: StepBlock;
  expected: string;
  gate: StepGate | null;
  status: StepStatus;
  done: number;
  total: number;
  window: [string, string] | null;
  lock_reason: string | null;
  actual: number | null;
  unlock: { by: string; at: string; reason: string } | null;
}

/**
 * Estado de uma etapa — porta literal de `store.tsx:70-102`. `actions` já vem
 * filtrado pela praça (o protótipo filtrava por `pracaId` aqui dentro).
 *
 * Portão (`GATED_BY`): a etapa fica `locked` enquanto a etapa anterior não
 * bate a meta — a menos que alguém tenha destravado à mão (`unlock`). Repare
 * na assimetria do protótipo, mantida de propósito: `gte` compara com
 * `actual ?? 0` (sem resultado nunca bate), `lte` exige resultado lançado.
 */
export function stepInfo(praca: StepPraca, actions: RecAction[], n: number): StepInfo {
  const def = STEPS.find((s) => s.n === n);
  if (!def) throw new Error(`Etapa ${n} não existe no roteiro-modelo.`);

  const acts = actions.filter((a) => a.step === n);
  const done = acts.filter(actionEverDone).length;
  const total = acts.length;

  let window: [string, string] | null = null;
  if (acts.length) {
    let min = Infinity;
    let max = -Infinity;
    for (const a of acts) {
      const r = a.rec;
      const s = r.kind === 'once' ? r.day : r.start_day;
      const e = r.kind === 'once' ? r.day : 'end_day' in r && r.end_day != null ? r.end_day : s;
      min = Math.min(min, s);
      max = Math.max(max, e);
    }
    window = [addDays(praca.start_date, min), addDays(praca.start_date, max)];
  }

  const st = praca.steps[n] ?? {};
  const base = {
    n,
    name: def.name,
    block: def.block,
    expected: def.expected,
    gate: def.gate ?? null,
    done,
    total,
    window,
    actual: st.actual ?? null,
    unlock: st.unlock ?? null,
  };

  const gatedBy = GATED_BY[n];
  if (gatedBy) {
    const prevDef = STEPS.find((s) => s.n === gatedBy)!;
    const prevState = praca.steps[gatedBy] ?? {};
    const g = prevDef.gate!;
    const actual = prevState.actual ?? 0;
    const met = g.dir === 'gte' ? actual >= g.target : actual <= g.target && prevState.actual != null;
    if (!met && !st.unlock) {
      return {
        ...base,
        status: 'locked',
        lock_reason: `Falta bater o Portão: ${g.label}. Hoje: ${actual}`,
      };
    }
  }

  const allDone = total > 0 && done === total;
  const hasResult = st.actual != null;
  const status: StepStatus = allDone && hasResult ? 'done' : done > 0 ? 'active' : 'todo';
  return { ...base, status, lock_reason: null };
}
