/**
 * Regras puras dos indicadores — porta de `.prototype/src/lib/praca/indicadores.ts`
 * (`periodRange` 18-34, `prevRange` 37-40, `semaphore` 88-94, `stageEnteredAt`
 * 112-118, `spendInRange` 120-127, `computeValue` 130-187, `readIndicator`
 * 208-239, `activeByMonth` 261-278, `whatChanged` 283-301, `pracaRows` 311-323,
 * `personRows` 332-355, `canalOf` 367-370, `canalRows` 377-402).
 *
 * Módulo PURO: sem Nest, sem Prisma. Tudo que o cálculo precisa entra num
 * único retrato (`IndData`) que o `IndicatorsService` monta por requisição, e
 * "hoje" entra sempre por parâmetro (com `todaySp()` de reserva) — a mesma
 * regra de `recurrence.ts` e `lead-rules.ts`.
 *
 * Três desvios conscientes do protótipo, todos anotados no ponto de uso:
 *  1. `stageEnteredAt` lê a coluna `lead_events.stage_to` em vez de procurar o
 *     número no texto do evento (`text.includes("7")` casava com "17", com
 *     "R$ 700" e com qualquer nota que citasse o número).
 *  2. Instante ISO vira dia de **Brasília** (`dayOf`), não dia UTC
 *     (`at.slice(0,10)`) — mesmo desvio já documentado em `lead-rules.ts`.
 *  3. `playbook` e as ações atrasadas usam a praça DE CADA AÇÃO para calcular o
 *     vencimento; o protótipo usava sempre a praça ativa da tela, o que dava
 *     data errada para ação de outra praça na visão Empresa.
 *
 * Formatação (`fmtVal`, cor do semáforo) fica no web: aqui só sai número.
 */
import { addDays, daysBetween, dateFromString, monthRange, todaySp, weekdayOf } from '../common/time/dates';
import {
  CANAIS,
  CONTACT_KINDS,
  FREQ_DAYS,
  IND_CATALOG,
  MESES,
  PERIODS,
  STEPS,
  type IndDef,
  type IndDir,
  type IndKey,
  type PeriodId,
} from './catalog';
import { fillHours } from './midia-rules';
import { dueDateOf, type Rec } from './recurrence';

// ── período ─────────────────────────────────────────────────────
export interface IndRange {
  from: string;
  to: string;
  label: string;
}

const periodLabel = (id: PeriodId): string => PERIODS.find((p) => p.id === id)?.label ?? id;

/** Janela do período escolhido. `livre` sem datas cai nos últimos 30 dias. */
export function periodRange(
  id: PeriodId,
  custom?: { from?: string; to?: string },
  today: string = todaySp(),
): IndRange {
  const label = periodLabel(id);
  if (id === 'hoje') return { from: today, to: today, label };
  // Semana COMERCIAL: começa na segunda. `weekdayOf` devolve 0 = domingo, então
  // `(wd + 6) % 7` é quantos dias andar para trás até a segunda.
  if (id === 'semana') return { from: addDays(today, -((weekdayOf(today) + 6) % 7)), to: today, label };
  if (id === 'mes') return { from: monthRange(today).from, to: today, label };
  if (id === 'd90') return { from: addDays(today, -89), to: today, label };
  return { from: custom?.from ?? addDays(today, -30), to: custom?.to ?? today, label };
}

/** Mesmo tamanho de janela, imediatamente antes. */
export function prevRange(r: IndRange): IndRange {
  const len = daysBetween(r.from, r.to) + 1;
  return { from: addDays(r.from, -len), to: addDays(r.from, -1), label: 'período anterior' };
}

/** Dia civil de Brasília de uma data só-dia ("YYYY-MM-DD") ou de um instante ISO. */
const dayOf = (value: string): string => (value.length > 10 ? todaySp(new Date(value)) : value);

const inRange = (d: string | null | undefined, r: IndRange): boolean =>
  !!d && dayOf(d) >= r.from && dayOf(d) <= r.to;

// ── semáforo ────────────────────────────────────────────────────
export type Sem = 'ok' | 'warn' | 'bad' | 'none';

/** Verde bateu a meta · amarelo até 15% fora · vermelho abaixo disso. */
export function semaphore(value: number | null | undefined, meta: number, dir: IndDir): Sem {
  if (value == null || !Number.isFinite(value)) return 'none';
  const met = dir === 'gte' ? value >= meta : value <= meta;
  if (met) return 'ok';
  const near = dir === 'gte' ? value >= meta * 0.85 : value <= meta * 1.15;
  return near ? 'warn' : 'bad';
}

// ── o retrato ───────────────────────────────────────────────────
/** Evento do lead visto pelos indicadores. `at` é instante ISO. */
export interface IndEventRow {
  kind: string;
  at: string;
  stage_to: number | null;
}

export interface IndVagaRow {
  date: string;
  filled: boolean;
  hours: number | null;
}

export interface IndLeadRow {
  id: string;
  praca_id: string | null;
  owner_id: string | null;
  origem: string;
  stage: number;
  entered_at: string;
  stage_since: string;
  events: IndEventRow[];
  vagas: IndVagaRow[];
}

export interface IndCampanhaRow {
  id: string;
  praca_id: string;
  gasto: number;
}

export interface IndTrafficEntryRow {
  id: string;
  campanha_id: string;
}

export interface IndTrafficDayRow {
  entry_id: string;
  date: string;
  investido: number;
}

/** Conclusão de ação recorrente (`action_completions`). `at` é instante ISO. */
export interface IndCompletionRow {
  date: string;
  at: string;
}

export interface IndActionRow {
  praca_id: string;
  step: number;
  owners: string[];
  rec: Rec;
  due_override: string | null;
  /** Instante ISO da conclusão da ação pontual. */
  completed_at: string | null;
  completions: IndCompletionRow[];
}

export interface IndPracaRow {
  id: string;
  name: string;
  start_date: string;
  /** `praca_step_states` por número de etapa. */
  steps: Record<number, { actual: number | null } | undefined>;
}

export interface IndSendRow {
  status: string;
  scheduled_at: string;
  sent_at: string | null;
  replied_at: string | null;
}

export interface IndEntryRow {
  praca_id: string;
  key: string;
  date: string;
  value: number;
}

export interface IndUserRow {
  id: string;
  name: string;
  email: string;
}

/** Tudo que os indicadores precisam ler, numa leitura só do banco. */
export interface IndData {
  leads: IndLeadRow[];
  campanhas: IndCampanhaRow[];
  traffic: IndTrafficEntryRow[];
  days: IndTrafficDayRow[];
  actions: IndActionRow[];
  pracas: IndPracaRow[];
  sends: IndSendRow[];
  entries: IndEntryRow[];
  users: IndUserRow[];
}

/** Retrato vazio — base dos testes e das rotas que não precisam de tudo. */
export const emptyIndData = (): IndData => ({
  leads: [],
  campanhas: [],
  traffic: [],
  days: [],
  actions: [],
  pracas: [],
  sends: [],
  entries: [],
  users: [],
});

// ── auxiliares de funil ─────────────────────────────────────────
/**
 * Quando o lead entrou na etapa: o evento MAIS ANTIGO que mudou para ela
 * (`stage_to`), e na falta dele o `stage_since` — só se o lead já chegou lá.
 */
export function stageEnteredAt(lead: IndLeadRow, stage: number): string | undefined {
  const ev = lead.events
    .filter((e) => e.stage_to === stage)
    .sort((a, b) => a.at.localeCompare(b.at))[0];
  if (ev) return dayOf(ev.at);
  return lead.stage >= stage ? lead.stage_since : undefined;
}

const leadsOf = (data: IndData, pracaId: string | null): IndLeadRow[] =>
  pracaId ? data.leads.filter((l) => l.praca_id === pracaId) : data.leads;

/** Verba de mídia no período; sem dia lançado, cai no gasto declarado. */
function spendInRange(data: IndData, pracaId: string | null, r: IndRange): number {
  const camps = data.campanhas.filter((c) => !pracaId || c.praca_id === pracaId);
  const campIds = new Set(camps.map((c) => c.id));
  const entryIds = new Set(data.traffic.filter((t) => campIds.has(t.campanha_id)).map((t) => t.id));
  const fromDays = data.days
    .filter((d) => entryIds.has(d.entry_id) && inRange(d.date, r))
    .reduce((a, d) => a + d.investido, 0);
  if (fromDays > 0) return fromDays;
  return camps.reduce((a, c) => a + (c.gasto || 0), 0);
}

/** Vencimento da ação pontual pela praça DELA (desvio 3 do cabeçalho). */
const actionDue = (a: IndActionRow, data: IndData): string | undefined => {
  if (a.due_override) return a.due_override;
  if (a.rec.kind !== 'once') return undefined;
  const praca = data.pracas.find((p) => p.id === a.praca_id);
  return praca ? dueDateOf({ step: a.step, rec: a.rec, due_override: null }, praca) : undefined;
};

/** Ação pontual vencida e ainda aberta. Concluída nunca conta como atrasada. */
const isLate = (a: IndActionRow, data: IndData, today: string): boolean => {
  if (a.rec.kind !== 'once' || a.completed_at) return false;
  const due = actionDue(a, data);
  return !!due && due < today;
};

/** Etapa do funil a partir da qual o lead conta como "cadastrado". */
const STAGE_CADASTRO = 5;
/** Etapa do cliente que rodou a primeira vaga. */
const STAGE_PRIMEIRA_VAGA = 6;
/** Etapa do cliente ativo (voltou a contratar). */
const STAGE_ATIVO = 7;
/** Etapa do lead perdido. */
const STAGE_PERDIDO = 8;
/** Etapa cujo resultado alimenta `freelancers` quando não há lançamento. */
const STEP_FREELANCERS = 2;

/** Valor calculado pelo sistema. `null` = sem base para calcular. */
export function computeValue(
  key: IndKey,
  data: IndData,
  pracaId: string | null,
  r: IndRange,
): number | null {
  const leads = leadsOf(data, pracaId);
  switch (key) {
    case 'clientes_ativos':
      return leads.filter(
        (l) => l.stage === STAGE_ATIVO && (stageEnteredAt(l, STAGE_ATIVO) ?? '') <= r.to,
      ).length;

    case 'recontratacao': {
      const base = leads.filter((l) => l.stage >= STAGE_PRIMEIRA_VAGA).length;
      if (!base) return null;
      return (leads.filter((l) => l.stage >= STAGE_ATIVO).length / base) * 100;
    }

    case 'tempo_preencher': {
      const horas = (id: string | null) => fillHours(leadsOf(data, id).flatMap((l) => l.vagas));
      if (pracaId) return horas(pracaId);
      // Empresa é a média das PRAÇAS, não a média das vagas: uma praça com 50
      // vagas não pode afogar a que acabou de abrir.
      const per = data.pracas.map((p) => horas(p.id)).filter((x): x is number => x != null);
      return per.length ? per.reduce((a, b) => a + b, 0) / per.length : null;
    }

    case 'perda_mensal': {
      const perdidos = leads.filter(
        (l) => l.stage === STAGE_PERDIDO && inRange(l.stage_since, r),
      ).length;
      const base = leads.filter((l) => l.stage >= STAGE_CADASTRO).length + perdidos;
      if (!base) return null;
      return (perdidos / base) * 100;
    }

    case 'custo_cliente': {
      // Sem ativo NO PERÍODO, divide pelos ativos de sempre (`||` do protótipo):
      // a verba do mês não deixa de ter custo só porque ninguém virou ativo nele.
      const novos =
        leads.filter((l) => l.stage === STAGE_ATIVO && inRange(stageEnteredAt(l, STAGE_ATIVO), r))
          .length || leads.filter((l) => l.stage === STAGE_ATIVO).length;
      const spend = spendInRange(data, pracaId, r);
      if (!novos || !spend) return null;
      return spend / novos;
    }

    case 'leads_novos':
      return leads.filter((l) => inRange(l.entered_at, r)).length;

    case 'passagem_etapa': {
      const tocados = leads.filter((l) => l.stage >= 2).length;
      if (!tocados) return null;
      const chegaram = leads.filter(
        (l) => l.stage >= STAGE_CADASTRO && l.stage !== STAGE_PERDIDO,
      ).length;
      return (chegaram / tocados) * 100;
    }

    case 'taxa_resposta': {
      const sends = data.sends.filter(
        (m) => m.status !== 'fila' && inRange(m.sent_at ?? m.scheduled_at, r),
      );
      if (!sends.length) return null;
      const respondidas = sends.filter((m) => m.status === 'respondida' || m.replied_at).length;
      return (respondidas / sends.length) * 100;
    }

    case 'playbook': {
      const acts = data.actions.filter((a) => !pracaId || a.praca_id === pracaId);
      const due = acts.filter((a) => {
        if (a.rec.kind !== 'once') return false;
        const d = actionDue(a, data);
        return !!d && d <= r.to;
      });
      if (!due.length) return null;
      return (due.filter((a) => a.completed_at).length / due.length) * 100;
    }

    // `falta`, `freelancers` e `contratos_rede` são lançados à mão.
    default:
      return null;
  }
}

// ── leitura do indicador ────────────────────────────────────────
export interface IndHistoryPoint {
  date: string;
  value: number;
}

export interface IndReading {
  def: IndDef;
  value: number | null;
  prev: number | null;
  delta: number | null;
  sem: Sem;
  /** Só para indicador à mão: o número está mais velho que a frequência dele. */
  stale: boolean;
  last_at: string | null;
  history: IndHistoryPoint[];
}

interface ManualRead {
  value: number | null;
  prev: number | null;
  stale: boolean;
}

/** Último lançamento até o fim do período (e o último antes do início). */
function manualOfPraca(
  def: IndDef,
  data: IndData,
  pracaId: string,
  r: IndRange,
  today: string,
): ManualRead {
  const hist = data.entries
    .filter((e) => e.key === def.key && e.praca_id === pracaId)
    .sort((a, b) => a.date.localeCompare(b.date));
  const ate = hist.filter((e) => e.date <= r.to);
  const antes = hist.filter((e) => e.date < r.from);
  const lastAt = hist.length ? hist[hist.length - 1]!.date : null;
  let value = ate.length ? ate[ate.length - 1]!.value : null;
  // Reserva do protótipo: sem lançamento, `freelancers` mostra o resultado da
  // etapa 2 do roteiro (os 40 garçons confirmados por telefone).
  if (def.key === 'freelancers' && value == null) {
    value = data.pracas.find((p) => p.id === pracaId)?.steps[STEP_FREELANCERS]?.actual ?? null;
  }
  return {
    value,
    prev: antes.length ? antes[antes.length - 1]!.value : null,
    stale: lastAt == null || daysBetween(lastAt, today) > (FREQ_DAYS[def.freq] ?? 7),
  };
}

/**
 * Empresa junta o último valor de cada praça: SOMA no indicador de contagem
 * (unidade vazia) e MÉDIA no de proporção (`%`, `h`, `R$`) — somar percentual de
 * falta de duas praças não significaria nada. Velho só quando TODAS estão velhas.
 */
function manualOfEmpresa(def: IndDef, data: IndData, r: IndRange, today: string): ManualRead {
  const per = data.pracas.map((p) => manualOfPraca(def, data, p.id, r, today));
  const junta = (pick: (m: ManualRead) => number | null): number | null => {
    const vals = per.map(pick).filter((v): v is number => v != null);
    if (!vals.length) return null;
    const soma = vals.reduce((a, b) => a + b, 0);
    return def.unit === '' ? soma : soma / vals.length;
  };
  return {
    value: junta((m) => m.value),
    prev: junta((m) => m.prev),
    stale: per.every((m) => m.stale),
  };
}

export function readIndicator(
  def: IndDef,
  data: IndData,
  pracaId: string | null,
  r: IndRange,
  today: string = todaySp(),
): IndReading {
  // Histórico do gráfico: na Empresa são os lançamentos de todas as praças,
  // com o valor como foi lançado (a junção de unidades fica no `value`).
  const history: IndHistoryPoint[] = data.entries
    .filter((e) => e.key === def.key && (!pracaId || e.praca_id === pracaId))
    .map((e) => ({ date: e.date, value: e.value }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const last_at = history.length ? history[history.length - 1]!.date : null;

  const manual =
    def.source === 'manual'
      ? pracaId
        ? manualOfPraca(def, data, pracaId, r, today)
        : manualOfEmpresa(def, data, r, today)
      : {
          value: computeValue(def.key, data, pracaId, r),
          prev: computeValue(def.key, data, pracaId, prevRange(r)),
          stale: false,
        };

  const { value, prev, stale } = manual;
  return {
    def,
    value,
    prev,
    delta: value != null && prev != null ? value - prev : null,
    sem: semaphore(value, def.meta, def.dir),
    stale,
    last_at,
    history,
  };
}

export const readAll = (
  data: IndData,
  pracaId: string | null,
  r: IndRange,
  today?: string,
): IndReading[] => IND_CATALOG.map((d) => readIndicator(d, data, pracaId, r, today));

// ── clientes ativos mês a mês ───────────────────────────────────
export interface MonthPoint {
  month: string;
  label: string;
  value: number;
  meta: number;
}

/** Caminho da meta de clientes ativos: de zero em 01/06/26 a 500 em 31/12/26. */
const META_FROM = '2026-06-01';
const META_TO = '2026-12-31';
const META_ALVO = 500;

export function activeByMonth(
  data: IndData,
  pracaId: string | null,
  months = 12,
  today: string = todaySp(),
): MonthPoint[] {
  const leads = leadsOf(data, pracaId);
  const [ano, mes] = today.split('-').map(Number);
  const startT = dateFromString(META_FROM).getTime();
  const alvoT = dateFromString(META_TO).getTime();
  const out: MonthPoint[] = [];

  for (let i = months - 1; i >= 0; i--) {
    // Mês civil calculado em UTC ao meio-dia (nunca escorrega de fuso).
    const d = new Date(Date.UTC(ano as number, (mes as number) - 1 - i, 1, 12));
    const month = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const end = monthRange(`${month}-01`).to;
    const value = leads.filter(
      (l) => l.stage === STAGE_ATIVO && (stageEnteredAt(l, STAGE_ATIVO) ?? '9999') <= end,
    ).length;
    const t = Math.min(1, Math.max(0, (d.getTime() - startT) / (alvoT - startT)));
    out.push({
      month,
      label: `${MESES[d.getUTCMonth()]!.toLowerCase()}/${String(d.getUTCFullYear()).slice(2)}`,
      value,
      meta: Math.round(t * META_ALVO),
    });
  }
  return out;
}

// ── o que mudou desde a semana passada ──────────────────────────
export interface IndChange {
  name: string;
  from: number;
  to: number;
  pct: number;
  good: boolean;
  unit: string;
}

/** Quantos indicadores entram em cada lado do "o que mudou". */
const CHANGE_TOP = 3;
/** Variação abaixo disso (em %) não é notícia. */
const CHANGE_MIN_PCT = 1;

export function whatChanged(
  data: IndData,
  pracaId: string | null,
  today: string = todaySp(),
): { good: IndChange[]; bad: IndChange[] } {
  const week: IndRange = { from: addDays(today, -6), to: today, label: '7 dias' };
  const changes: IndChange[] = [];
  for (const def of IND_CATALOG) {
    const cur = readIndicator(def, data, pracaId, week, today);
    if (cur.value == null || cur.prev == null || cur.prev === 0) continue;
    const pct = ((cur.value - cur.prev) / Math.abs(cur.prev)) * 100;
    if (Math.abs(pct) < CHANGE_MIN_PCT) continue;
    const better = def.dir === 'gte' ? cur.value > cur.prev : cur.value < cur.prev;
    changes.push({ name: def.name, from: cur.prev, to: cur.value, pct, good: better, unit: def.unit });
  }
  const sorted = changes.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
  return {
    good: sorted.filter((c) => c.good).slice(0, CHANGE_TOP),
    bad: sorted.filter((c) => !c.good).slice(0, CHANGE_TOP),
  };
}

// ── visão praça ─────────────────────────────────────────────────
export interface IndPracaRowView {
  praca: { id: string; name: string };
  step_atual: number;
  ativos: number;
  recontratacao: number | null;
  fill: number | null;
  falta: number | null;
  freelancers: number | null;
  custo: number | null;
  atrasadas: number;
}

const FALTA = IND_CATALOG.find((d) => d.key === 'falta')!;
const FREELANCERS = IND_CATALOG.find((d) => d.key === 'freelancers')!;

/**
 * Etapa atual: quantas etapas têm TODAS as ações concluídas, mais um, com teto
 * na última etapa do roteiro. Etapa sem ação nenhuma conta como concluída
 * (`every` de lista vazia) — quirk do protótipo, mantido de propósito.
 */
const stepOf = (data: IndData, pracaId: string): number => {
  const fechadas = STEPS.filter((st) =>
    data.actions
      .filter((a) => a.praca_id === pracaId && a.step === st.n)
      .every((a) => !!a.completed_at),
  ).length;
  return Math.min(STEPS.length, fechadas + 1);
};

export function pracaRows(data: IndData, r: IndRange, today: string = todaySp()): IndPracaRowView[] {
  return data.pracas.map((p) => ({
    praca: { id: p.id, name: p.name },
    step_atual: stepOf(data, p.id),
    ativos: computeValue('clientes_ativos', data, p.id, r) ?? 0,
    recontratacao: computeValue('recontratacao', data, p.id, r),
    fill: computeValue('tempo_preencher', data, p.id, r),
    falta: readIndicator(FALTA, data, p.id, r, today).value,
    freelancers: readIndicator(FREELANCERS, data, p.id, r, today).value,
    custo: computeValue('custo_cliente', data, p.id, r),
    atrasadas: data.actions.filter((a) => a.praca_id === p.id && isLate(a, data, today)).length,
  }));
}

// ── visão pessoa ────────────────────────────────────────────────
export interface IndPersonRowView {
  id: string;
  name: string;
  no_prazo: number;
  atrasadas: number;
  leads_tocados: number;
  leads_avancados: number;
  fechados: number;
  vagas: number;
}

/** Toque de verdade no lead (nota e mudança de etapa não são contato). */
const TOQUE = CONTACT_KINDS.filter((k) => k !== 'msg_in') as string[];

export function personRows(
  data: IndData,
  r: IndRange,
  today: string = todaySp(),
): IndPersonRowView[] {
  return data.users.map((u) => {
    const acts = data.actions.filter((a) => a.owners.includes(u.id));
    // Uma conclusão por ação pontual (`completed_at`) e uma por dia marcado da
    // recorrente (`completions`) — só as que caíram no período.
    const feitas = acts
      .flatMap((a) => [
        ...(a.completed_at ? [{ at: a.completed_at, act: a }] : []),
        ...a.completions.map((c) => ({ at: c.at, act: a })),
      ])
      .filter((c) => inRange(c.at, r));
    const leads = data.leads.filter((l) => l.owner_id === u.id);
    return {
      id: u.id,
      name: u.name,
      no_prazo: feitas.filter((c) => !isLate(c.act, data, today)).length,
      atrasadas: acts.filter((a) => isLate(a, data, today)).length,
      leads_tocados: leads.filter((l) =>
        l.events.some((e) => TOQUE.includes(e.kind) && inRange(e.at, r)),
      ).length,
      leads_avancados: leads.filter((l) =>
        l.events.some((e) => e.kind === 'stage' && inRange(e.at, r)),
      ).length,
      fechados: leads.filter(
        (l) =>
          l.stage >= STAGE_PRIMEIRA_VAGA && inRange(stageEnteredAt(l, STAGE_PRIMEIRA_VAGA), r),
      ).length,
      vagas: leads.reduce((a, l) => a + l.vagas.filter((v) => inRange(v.date, r)).length, 0),
    };
  });
}

// ── visão canal ─────────────────────────────────────────────────
/** Canal do lead pela origem escrita nele; sem casar, é prospecção ativa. */
export const canalOf = (origem: string): string => {
  const o = (origem || '').toLowerCase();
  return CANAIS.find((c) => c.match.some((m) => o.includes(m)))?.id ?? 'prospeccao';
};

export interface IndCanalRowView {
  id: string;
  label: string;
  leads: number;
  ativos: number;
  conv: number | null;
  custo: number | null;
  tempo_primeira_vaga: number | null;
}

export function canalRows(data: IndData, pracaId: string | null, r: IndRange): IndCanalRowView[] {
  const leads = leadsOf(data, pracaId);
  const spend = spendInRange(data, pracaId, r);
  return CANAIS.map((c) => {
    const mine = leads.filter((l) => canalOf(l.origem) === c.id);
    const ativos = mine.filter((l) => l.stage === STAGE_ATIVO).length;
    const dias = mine
      .map((l) => {
        const v = [...l.vagas].sort((a, b) => a.date.localeCompare(b.date))[0];
        return v ? daysBetween(l.entered_at, v.date) : null;
      })
      .filter((x): x is number => x != null && x >= 0);
    return {
      id: c.id,
      label: c.label,
      leads: mine.length,
      ativos,
      conv: mine.length ? (ativos / mine.length) * 100 : null,
      // Só canal com mídia paga tem custo por cliente; os outros não consomem verba.
      custo: c.id === 'trafego' ? (ativos && spend ? spend / ativos : null) : null,
      tempo_primeira_vaga: dias.length ? dias.reduce((a, b) => a + b, 0) / dias.length : null,
    };
  });
}

// ── metas por horizonte ─────────────────────────────────────────
/** Quanto do caminho já foi andado (teto de 100%, nunca negativo). */
export function milestonePct(value: number | null, meta: number, dir: IndDir): number {
  if (value == null) return 0;
  return dir === 'gte'
    ? Math.min(100, (value / meta) * 100)
    : Math.min(100, (meta / Math.max(value, 0.01)) * 100);
}
