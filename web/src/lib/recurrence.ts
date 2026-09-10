// Cópia de apresentação das regras de recorrência — o MESMO código puro que
// roda no servidor (`api/src/domain/recurrence.ts`, portado de
// `.prototype/src/lib/praca/store.tsx:26-59`).
//
// Por que duplicar: a agenda (o que está atrasado, o que cai hoje) vem pronta
// da API; o que fica aqui é só PRAZO NA TELA — o rótulo do vencimento de uma
// ação (`12/09`, `toda segunda`) e o "esta ocorrência já está concluída?" do
// checkbox. Sem isso, cada linha da lista precisaria de uma ida ao servidor.
// `stepInfo` NÃO foi portado de propósito: etapa é regra de negócio e vem de
// `GET /v1/pracas/:id/steps`.

import { addDays, fmtBR, parse, wdOf, WD_LONG } from './dates';

/** `rec` do wire (snake_case, espelhando o banco — contrato §6). */
export type Rec =
  | { kind: 'once'; day: number }
  | { kind: 'daily' | 'weekday'; start_day: number; end_day?: number }
  | { kind: 'weekly'; weekday: number; start_day: number; end_day?: number }
  | { kind: 'monthly'; month_day: number; start_day: number };

/** O mínimo de uma ação para estas regras (o resto do `ActionView` não importa). */
export interface RecAction {
  step: number;
  rec: Rec;
  due_override?: string | null;
  completed_at?: string | null;
  completions?: Record<string, unknown>;
}

export interface RecPraca {
  start_date: string;
}

/** Dia devido de uma ação `once` ("" para recorrente). */
export const dueDateOf = (a: RecAction, p: RecPraca): string =>
  a.rec.kind === 'once' ? (a.due_override ?? addDays(p.start_date, a.rec.day)) : '';

/**
 * A ação cai neste dia? Inclui a regra das **ações fixas** (`step === 0`):
 * elas rolam todo dia, mesmo antes do início da praça — mas ainda respeitam o
 * `end_day`, como no protótipo.
 */
export function occursOn(a: RecAction, p: RecPraca, date: string): boolean {
  if (a.rec.kind === 'once') return dueDateOf(a, p) === date;
  const start = addDays(p.start_date, a.rec.start_day);
  if (a.step !== 0 && date < start) return false;
  if ('end_day' in a.rec && a.rec.end_day != null && date > addDays(p.start_date, a.rec.end_day)) {
    return false;
  }
  const wd = wdOf(date);
  switch (a.rec.kind) {
    case 'daily':
      return true;
    case 'weekday':
      return wd >= 1 && wd <= 5;
    case 'weekly':
      return wd === a.rec.weekday;
    case 'monthly':
      return parse(date).getDate() === a.rec.month_day;
  }
}

/** Ação `once` olha `completed_at`; recorrente olha a ocorrência daquele dia. */
export const isDoneOn = (a: RecAction, date: string): boolean =>
  a.rec.kind === 'once' ? !!a.completed_at : !!a.completions?.[date];

export const actionEverDone = (a: RecAction): boolean =>
  a.rec.kind === 'once' ? !!a.completed_at : Object.keys(a.completions ?? {}).length > 0;

/** Rótulo do prazo: data para `once`, cadência para o resto. */
export function recLabel(a: RecAction, p: RecPraca): string {
  const r = a.rec;
  switch (r.kind) {
    case 'once':
      return fmtBR(dueDateOf(a, p));
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
