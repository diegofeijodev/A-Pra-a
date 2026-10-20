/**
 * Remuneração do consultor de campo (F8, contrato §28) — regras PURAS.
 * Sem banco, rede ou relógio. Todo valor é INTEIRO em centavos; não há divisão no cálculo.
 * Nenhum valor é fixo: `REGRA_PADRAO` é só a versão 1, gravada pela migração e editável por nova versão.
 */
import { addDays, eachDay, isDateString, weekdayOf } from '../common/time/dates';

export const PERIODOS_FAIXA = ['day', 'week'] as const;
export type PeriodoFaixa = (typeof PERIODOS_FAIXA)[number];
export const COMBINACOES = ['max', 'sum', 'tier_only'] as const;
export type Combinacao = (typeof COMBINACOES)[number];
export const CONDICOES_PISO = ['none', 'journey_open', 'min_visits'] as const;
export type CondicaoPiso = (typeof CONDICOES_PISO)[number];
export const CONTAGENS_VISITA = ['checkin', 'checkout'] as const;
export type ContagemVisita = (typeof CONTAGENS_VISITA)[number];

export interface Faixa {
  min_signups: number;
  amount_cents: number;
}

export interface RegraRemuneracao {
  unit_cents: number;
  tiers_period: PeriodoFaixa;
  tiers: Faixa[];
  combine: Combinacao;
  cap_cents: number | null;
  floor_cents: number;
  floor_condition: CondicaoPiso;
  floor_min_visits: number;
  visits_count: ContagemVisita;
  week_start_weekday: number;
  payout_weekday: number;
  autoclose_hour: number;
  late_grace_days: number;
}

export interface VersaoRegra {
  version: number;
  valid_from: string;
  config: RegraRemuneracao;
}

/** Padrão INICIAL (versão 1). Editável: nunca é lido como constante de negócio fora daqui. */
export const REGRA_PADRAO: RegraRemuneracao = {
  unit_cents: 1000,
  tiers_period: 'day',
  tiers: [
    { min_signups: 10, amount_cents: 10000 },
    { min_signups: 20, amount_cents: 25000 },
  ],
  combine: 'max',
  cap_cents: null,
  floor_cents: 0,
  floor_condition: 'none',
  floor_min_visits: 0,
  visits_count: 'checkin',
  week_start_weekday: 1,
  payout_weekday: 1,
  autoclose_hour: 6,
  late_grace_days: 14,
};

export const LIMITES_REGRA = {
  unit_cents: { min: 0, max: 1_000_000 },
  tiers_max: 10,
  tier_min_signups: { min: 1, max: 1000 },
  tier_amount_cents: { min: 1, max: 10_000_000 },
  cap_cents: { min: 1, max: 100_000_000 },
  floor_cents: { min: 0, max: 10_000_000 },
  floor_min_visits: { min: 0, max: 1000 },
  weekday: { min: 0, max: 6 },
  autoclose_hour: { min: 0, max: 23 },
  late_grace_days: { min: 0, max: 92 },
} as const;

export const CHAVES_REGRA = Object.keys(REGRA_PADRAO) as (keyof RegraRemuneracao)[];

// ── formatação ────────────────────────────────────────────────────────────

/** "R$ 1.234,50"; negativo "-R$ 10,00". Só aritmética inteira. */
export function brl(cents: number): string {
  const neg = cents < 0;
  const abs = Math.abs(Math.trunc(cents));
  const reais = Math.floor(abs / 100);
  const cent = abs % 100;
  const milhar = String(reais).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${neg ? '-' : ''}R$ ${milhar},${String(cent).padStart(2, '0')}`;
}

export const plural = (n: number, um: string, varios: string): string => `${n} ${n === 1 ? um : varios}`;

const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
/** "26/10" */
export const diaMes = (dia: string): string => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
/** "seg 26/10" */
export const rotuloDia = (dia: string): string => `${DIAS_CURTOS[weekdayOf(dia)]} ${diaMes(dia)}`;
/** "26/10/2026" */
export const dataBR = (dia: string): string => `${diaMes(dia)}/${dia.slice(0, 4)}`;

// ── validação (estrita) ───────────────────────────────────────────────────

const ehInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
const oneOf = <T extends string>(lista: readonly T[], v: unknown): v is T =>
  typeof v === 'string' && (lista as readonly string[]).includes(v);

export type ResultadoValidacao =
  { ok: true; regra: RegraRemuneracao } | { ok: false; campo: string; erro: string };

/** Valida a configuração COMPLETA. Chave desconhecida ou ausente = erro com o nome do campo. */
export function validarRegra(raw: unknown): ResultadoValidacao {
  const falha = (campo: string, erro: string): ResultadoValidacao => ({
    ok: false,
    campo,
    erro: `${campo}: ${erro}`,
  });
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return falha('config', 'envie um objeto.');
  const o = raw as Record<string, unknown>;
  for (const k of Object.keys(o))
    if (!(CHAVES_REGRA as string[]).includes(k)) return falha(k, 'campo desconhecido.');
  for (const k of CHAVES_REGRA) if (o[k] === undefined) return falha(k, 'obrigatório.');
  const L = LIMITES_REGRA;
  if (!ehInt(o.unit_cents, L.unit_cents.min, L.unit_cents.max))
    return falha('unit_cents', `inteiro em centavos de ${L.unit_cents.min} a ${L.unit_cents.max}.`);
  if (!oneOf(PERIODOS_FAIXA, o.tiers_period)) return falha('tiers_period', 'use day ou week.');
  if (!Array.isArray(o.tiers) || o.tiers.length > L.tiers_max)
    return falha('tiers', `lista de até ${L.tiers_max} faixas.`);
  const tiers: Faixa[] = [];
  for (const [i, t] of o.tiers.entries()) {
    const f = (t ?? {}) as Record<string, unknown>;
    if (
      !t ||
      typeof t !== 'object' ||
      Object.keys(f).some((k) => k !== 'min_signups' && k !== 'amount_cents')
    )
      return falha('tiers', `faixa ${i + 1}: use só min_signups e amount_cents.`);
    if (!ehInt(f.min_signups, L.tier_min_signups.min, L.tier_min_signups.max))
      return falha(
        'tiers',
        `faixa ${i + 1}: min_signups inteiro de ${L.tier_min_signups.min} a ${L.tier_min_signups.max}.`,
      );
    if (!ehInt(f.amount_cents, L.tier_amount_cents.min, L.tier_amount_cents.max))
      return falha(
        'tiers',
        `faixa ${i + 1}: amount_cents inteiro em centavos de ${L.tier_amount_cents.min} a ${L.tier_amount_cents.max}.`,
      );
    const ant = tiers[i - 1];
    if (ant && f.min_signups <= ant.min_signups)
      return falha('tiers', `faixa ${i + 1}: min_signups precisa ser maior que o da faixa anterior.`);
    if (ant && f.amount_cents < ant.amount_cents)
      return falha('tiers', `faixa ${i + 1}: uma faixa maior não pode pagar menos que a anterior.`);
    tiers.push({ min_signups: f.min_signups, amount_cents: f.amount_cents });
  }
  if (!oneOf(COMBINACOES, o.combine)) return falha('combine', 'use max, sum ou tier_only.');
  if (o.combine === 'tier_only' && tiers.length === 0)
    return falha('tiers', 'no modo tier_only é preciso ao menos uma faixa.');
  if (o.cap_cents !== null && !ehInt(o.cap_cents, L.cap_cents.min, L.cap_cents.max))
    return falha('cap_cents', 'inteiro em centavos ou null (sem teto).');
  if (!ehInt(o.floor_cents, L.floor_cents.min, L.floor_cents.max))
    return falha(
      'floor_cents',
      `inteiro em centavos de ${L.floor_cents.min} a ${L.floor_cents.max} (0 = sem piso).`,
    );
  if (!oneOf(CONDICOES_PISO, o.floor_condition))
    return falha('floor_condition', 'use none, journey_open ou min_visits.');
  if (!ehInt(o.floor_min_visits, L.floor_min_visits.min, L.floor_min_visits.max))
    return falha('floor_min_visits', 'inteiro de 0 a 1000.');
  if (o.floor_condition === 'min_visits' && o.floor_cents > 0 && o.floor_min_visits < 1)
    return falha('floor_min_visits', 'com a condição min_visits informe ao menos 1 visita.');
  if (!oneOf(CONTAGENS_VISITA, o.visits_count)) return falha('visits_count', 'use checkin ou checkout.');
  if (!ehInt(o.week_start_weekday, 0, 6))
    return falha('week_start_weekday', 'dia da semana de 0 (domingo) a 6 (sábado).');
  if (!ehInt(o.payout_weekday, 0, 6))
    return falha('payout_weekday', 'dia da semana de 0 (domingo) a 6 (sábado).');
  if (!ehInt(o.autoclose_hour, 0, 23)) return falha('autoclose_hour', 'hora de 0 a 23.');
  if (!ehInt(o.late_grace_days, L.late_grace_days.min, L.late_grace_days.max))
    return falha('late_grace_days', `inteiro de ${L.late_grace_days.min} a ${L.late_grace_days.max}.`);
  if (o.cap_cents !== null && o.cap_cents < o.floor_cents)
    return falha('cap_cents', 'o teto não pode ser menor que o piso.');
  return {
    ok: true,
    regra: {
      unit_cents: o.unit_cents,
      tiers_period: o.tiers_period,
      tiers,
      combine: o.combine,
      cap_cents: o.cap_cents as number | null,
      floor_cents: o.floor_cents,
      floor_condition: o.floor_condition,
      floor_min_visits: o.floor_min_visits,
      visits_count: o.visits_count,
      week_start_weekday: o.week_start_weekday,
      payout_weekday: o.payout_weekday,
      autoclose_hour: o.autoclose_hour,
      late_grace_days: o.late_grace_days,
    },
  };
}

/** JSON já salvo (validado ao entrar). Se estiver corrompido, falha alto: pagar com regra errada é pior que parar. */
export function lerRegraSalva(raw: unknown): RegraRemuneracao {
  const r = validarRegra(raw);
  if (!r.ok) throw new Error(`Regra de remuneração salva inválida (${r.campo}).`);
  return r.regra;
}

// ── vigência ──────────────────────────────────────────────────────────────

/** Versão com maior `valid_from ≤ dia`; empate: maior `version`. `null` se nenhuma começou. */
export function versaoVigente<T extends { version: number; valid_from: string }>(
  versoes: readonly T[],
  dia: string,
): T | null {
  let melhor: T | null = null;
  for (const v of versoes) {
    if (v.valid_from > dia) continue;
    if (
      !melhor ||
      v.valid_from > melhor.valid_from ||
      (v.valid_from === melhor.valid_from && v.version > melhor.version)
    )
      melhor = v;
  }
  return melhor;
}

export function inicioDaSemana(dia: string, weekStartWeekday: number): string {
  return addDays(dia, -((weekdayOf(dia) - weekStartWeekday + 7) % 7));
}

export function semanaDoDia(dia: string, weekStartWeekday: number): { from: string; to: string } {
  const from = inicioDaSemana(dia, weekStartWeekday);
  return { from, to: addDays(from, 6) };
}

export type ErroVigencia = { code: 'VALIDATION_ERROR' | 'WEEK_START_LOCKED'; campo: string; message: string };

/**
 * Nova versão: começa hoje ou depois (o passado nunca é reescrito); com faixa/teto semanal (na nova ou na
 * vigente) tem de começar no primeiro dia da semana; a semana não muda depois que existe razão/fechamento.
 */
export function validarVigencia(p: {
  valid_from: string;
  nova: RegraRemuneracao;
  hoje: string;
  versoes: readonly VersaoRegra[];
  semanaTravada: boolean;
}): ErroVigencia | null {
  if (!isDateString(p.valid_from))
    return { code: 'VALIDATION_ERROR', campo: 'valid_from', message: 'valid_from: use uma data AAAA-MM-DD.' };
  if (p.valid_from < p.hoje)
    return {
      code: 'VALIDATION_ERROR',
      campo: 'valid_from',
      message: 'valid_from: a regra só vale de hoje em diante; dias passados não são reescritos.',
    };
  const antes = versaoVigente(p.versoes, p.valid_from);
  if (antes && antes.config.week_start_weekday !== p.nova.week_start_weekday && p.semanaTravada) {
    return {
      code: 'WEEK_START_LOCKED',
      campo: 'week_start_weekday',
      message:
        'week_start_weekday: não dá para mudar o início da semana depois que há ganhos lançados ou semanas fechadas.',
    };
  }
  const semanal = p.nova.tiers_period === 'week' || antes?.config.tiers_period === 'week';
  if (semanal && p.valid_from !== inicioDaSemana(p.valid_from, p.nova.week_start_weekday)) {
    return {
      code: 'VALIDATION_ERROR',
      campo: 'valid_from',
      message:
        'valid_from: com faixa ou teto semanal (nesta regra ou na vigente) a regra precisa começar no primeiro dia da semana.',
    };
  }
  return null;
}

// ── cálculo ───────────────────────────────────────────────────────────────

export interface EntradaDia {
  dia: string;
  /** Cadastros confirmados cujo dia do evento (Brasília) é `dia`. */
  signups: number;
  /** Visitas do dia conforme `visits_count`. */
  visits: number;
  /** Houve jornada iniciada no dia. */
  journey_open: boolean;
  /** Consultor existia e está ativo (condição `none` do piso). */
  elegivel: boolean;
}

export interface ProximaFaixa {
  min_signups: number;
  amount_cents: number;
  faltam: number;
}

export interface ResultadoDia {
  dia: string;
  futuro: boolean;
  rule_version: number | null;
  signups: number;
  visits: number;
  journey_open: boolean;
  total_cents: number;
  unit_cents: number;
  por_cadastro_cents: number;
  faixa: Faixa | null;
  faixa_cents: number;
  nucleo_cents: number;
  piso_aplicado: boolean;
  piso_motivo: string | null;
  teto_aplicado: boolean;
  proxima_faixa: ProximaFaixa | null;
  conta: string[];
}

export function faixaAtingida(tiers: readonly Faixa[], n: number): Faixa | null {
  let r: Faixa | null = null;
  for (const t of tiers) if (n >= t.min_signups && (!r || t.min_signups > r.min_signups)) r = t;
  return r;
}

export function proximaFaixa(tiers: readonly Faixa[], n: number): ProximaFaixa | null {
  let r: Faixa | null = null;
  for (const t of tiers) if (t.min_signups > n && (!r || t.min_signups < r.min_signups)) r = t;
  return r ? { ...r, faltam: r.min_signups - n } : null;
}

function condicaoPisoTexto(r: RegraRemuneracao): string {
  if (r.floor_condition === 'journey_open') return 'houve jornada iniciada no dia';
  if (r.floor_condition === 'min_visits')
    return `ao menos ${plural(r.floor_min_visits, 'visita', 'visitas')} no dia`;
  return 'dia de consultor ativo';
}

function pisoVale(r: RegraRemuneracao, e: EntradaDia): { vale: boolean; motivo: string | null } {
  if (r.floor_cents <= 0) return { vale: false, motivo: null };
  if (r.floor_condition === 'none')
    return e.elegivel ? { vale: true, motivo: null } : { vale: false, motivo: 'o consultor não está ativo' };
  if (r.floor_condition === 'journey_open')
    return e.journey_open
      ? { vale: true, motivo: null }
      : { vale: false, motivo: 'não houve jornada iniciada no dia' };
  return e.visits >= r.floor_min_visits
    ? { vale: true, motivo: null }
    : {
        vale: false,
        motivo: `foram ${plural(e.visits, 'visita', 'visitas')} e o mínimo é ${r.floor_min_visits}`,
      };
}

/** Valor de UM dia com a regra que vigora nele. */
export function calcularDia(
  regra: RegraRemuneracao,
  e: EntradaDia,
  version: number | null = null,
): ResultadoDia {
  const n = e.signups;
  const porCadastro = regra.combine === 'tier_only' ? 0 : n * regra.unit_cents;
  const diaria = regra.tiers_period === 'day';
  const faixa = diaria ? faixaAtingida(regra.tiers, n) : null;
  const faixaCents = faixa?.amount_cents ?? 0;
  const nucleo = !diaria
    ? porCadastro
    : regra.combine === 'max'
      ? Math.max(porCadastro, faixaCents)
      : porCadastro + faixaCents;
  const piso = pisoVale(regra, e);
  const comPiso = piso.vale ? Math.max(nucleo, regra.floor_cents) : nucleo;
  const total = diaria && regra.cap_cents !== null ? Math.min(comPiso, regra.cap_cents) : comPiso;
  const pisoAplicado = piso.vale && regra.floor_cents > nucleo;
  const tetoAplicado = diaria && regra.cap_cents !== null && comPiso > regra.cap_cents;
  const prox = diaria ? proximaFaixa(regra.tiers, n) : null;

  const conta: string[] = [];
  if (regra.combine === 'tier_only') {
    conta.push(
      `${plural(n, 'cadastro confirmado', 'cadastros confirmados')}; nesta regra só vale a faixa, não o valor por cadastro.`,
    );
  } else {
    conta.push(
      `${plural(n, 'cadastro confirmado', 'cadastros confirmados')} × ${brl(regra.unit_cents)} = ${brl(porCadastro)}.`,
    );
  }
  if (diaria) {
    if (faixa)
      conta.push(
        `Faixa atingida: ${plural(faixa.min_signups, 'cadastro', 'cadastros')} = ${brl(faixa.amount_cents)}.`,
      );
    if (faixa && regra.combine === 'max' && porCadastro > 0) conta.push(`Vale o maior: ${brl(nucleo)}.`);
    if (faixa && regra.combine !== 'max' && porCadastro > 0)
      conta.push(`Soma do valor por cadastro com a faixa: ${brl(nucleo)}.`);
    if (prox)
      conta.push(
        `Faltam ${plural(prox.faltam, 'cadastro confirmado', 'cadastros confirmados')} para a faixa de ${brl(prox.amount_cents)} (${plural(prox.min_signups, 'cadastro', 'cadastros')}).`,
      );
  }
  if (regra.floor_cents > 0) {
    if (piso.vale) {
      conta.push(
        pisoAplicado
          ? `Piso do dia de ${brl(regra.floor_cents)} (${condicaoPisoTexto(regra)}): sobe de ${brl(nucleo)} para ${brl(regra.floor_cents)}.`
          : `Piso do dia de ${brl(regra.floor_cents)} (${condicaoPisoTexto(regra)}) já foi superado.`,
      );
    } else {
      conta.push(`Piso do dia de ${brl(regra.floor_cents)} não vale: ${piso.motivo}.`);
    }
  }
  if (tetoAplicado)
    conta.push(
      `Teto do dia de ${brl(regra.cap_cents as number)} aplicado: o valor cai de ${brl(comPiso)} para ${brl(total)}.`,
    );
  conta.push(`Total do dia: ${brl(total)}.`);

  return {
    dia: e.dia,
    futuro: false,
    rule_version: version,
    signups: n,
    visits: e.visits,
    journey_open: e.journey_open,
    total_cents: total,
    unit_cents: regra.unit_cents,
    por_cadastro_cents: porCadastro,
    faixa,
    faixa_cents: faixaCents,
    nucleo_cents: nucleo,
    piso_aplicado: pisoAplicado,
    piso_motivo: piso.motivo,
    teto_aplicado: tetoAplicado,
    proxima_faixa: prox,
    conta,
  };
}

export interface ResultadoSemana {
  from: string;
  to: string;
  rule_version: number | null;
  days: ResultadoDia[];
  signups_week: number;
  /** Soma dos dias (já com piso; teto só nos dias de faixa diária). */
  days_cents: number;
  /** Parte semanal (faixa/teto semanal) = semana − soma dos dias. 0 com faixa por dia. */
  week_part_cents: number;
  total_cents: number;
  conta: string[];
}

function diaVazio(dia: string): EntradaDia {
  return { dia, signups: 0, visits: 0, journey_open: false, elegivel: false };
}

/**
 * Valor de uma semana (`from`…`to`) até `hoje`: dias futuros valem 0. Cada dia usa a versão vigente nele;
 * a parte semanal usa a versão vigente no primeiro dia da semana.
 */
export function calcularSemana(p: {
  from: string;
  to: string;
  hoje: string;
  versoes: readonly VersaoRegra[];
  entradas: Readonly<Record<string, EntradaDia | undefined>>;
}): ResultadoSemana {
  const vSemana = versaoVigente(p.versoes, p.from);
  const days: ResultadoDia[] = eachDay(p.from, p.to).map((dia) => {
    const v = versaoVigente(p.versoes, dia);
    if (!v) throw new Error(`Nenhuma versão da regra de remuneração vigora em ${dia}.`);
    if (dia > p.hoje)
      return {
        ...calcularDia(v.config, diaVazio(dia), v.version),
        futuro: true,
        total_cents: 0,
        conta: ['Dia ainda não chegou.'],
      };
    return calcularDia(v.config, p.entradas[dia] ?? diaVazio(dia), v.version);
  });
  const daysCents = days.reduce((a, d) => a + d.total_cents, 0);
  const signupsWeek = days.reduce((a, d) => a + d.signups, 0);
  const conta: string[] = [];
  for (const d of days) {
    if (d.futuro) continue;
    conta.push(
      `${rotuloDia(d.dia)}: ${brl(d.total_cents)} (${plural(d.signups, 'cadastro confirmado', 'cadastros confirmados')}).`,
    );
  }
  conta.push(`Soma dos dias: ${brl(daysCents)}.`);

  let parte = 0;
  const rs = vSemana?.config;
  if (rs && rs.tiers_period === 'week') {
    const faixa = faixaAtingida(rs.tiers, signupsWeek);
    const faixaCents = faixa?.amount_cents ?? 0;
    const pre = rs.combine === 'max' ? Math.max(daysCents, faixaCents) : daysCents + faixaCents;
    const semana = rs.cap_cents !== null ? Math.min(pre, rs.cap_cents) : pre;
    parte = semana - daysCents;
    if (faixa) {
      conta.push(
        `Faixa semanal atingida: ${plural(faixa.min_signups, 'cadastro', 'cadastros')} na semana = ${brl(faixa.amount_cents)} (a semana teve ${plural(signupsWeek, 'cadastro confirmado', 'cadastros confirmados')}).`,
      );
      conta.push(
        rs.combine === 'max'
          ? `Vale o maior entre a soma dos dias e a faixa: ${brl(Math.max(daysCents, faixaCents))}.`
          : `Soma dos dias com a faixa: ${brl(daysCents + faixaCents)}.`,
      );
    } else {
      const prox = proximaFaixa(rs.tiers, signupsWeek);
      if (prox)
        conta.push(
          `Faltam ${plural(prox.faltam, 'cadastro confirmado', 'cadastros confirmados')} na semana para a faixa semanal de ${brl(prox.amount_cents)}.`,
        );
    }
    if (rs.cap_cents !== null && pre > rs.cap_cents)
      conta.push(`Teto da semana de ${brl(rs.cap_cents)} aplicado.`);
  }
  const total = daysCents + parte;
  conta.push(`Total da semana: ${brl(total)}.`);
  return {
    from: p.from,
    to: p.to,
    rule_version: vSemana?.version ?? null,
    days,
    signups_week: signupsWeek,
    days_cents: daysCents,
    week_part_cents: parte,
    total_cents: total,
    conta,
  };
}

// ── razão: alvos, deltas, semana de pagamento ─────────────────────────────

export type EscopoTrabalho = 'day' | 'week';

export interface AlvoLancamento {
  scope: EscopoTrabalho;
  work_day: string | null;
  work_week: string;
  cents: number;
  rule_version: number | null;
}

/** O que a semana DEVE valer, em lançamentos: um por dia trabalhado (até hoje) e, se houver, a parte semanal. */
export function alvosDaSemana(s: ResultadoSemana): AlvoLancamento[] {
  const alvos: AlvoLancamento[] = s.days
    .filter((d) => !d.futuro)
    .map((d) => ({
      scope: 'day' as const,
      work_day: d.dia,
      work_week: s.from,
      cents: d.total_cents,
      rule_version: d.rule_version,
    }));
  alvos.push({
    scope: 'week',
    work_day: null,
    work_week: s.from,
    cents: s.week_part_cents,
    rule_version: s.rule_version,
  });
  return alvos;
}

export const chaveTrabalho = (scope: EscopoTrabalho, work_day: string | null, work_week: string): string =>
  `${scope}:${scope === 'day' ? work_day : work_week}`;

export interface JaLancado {
  /** Soma dos lançamentos `accrual` do período de trabalho (ajustes e estornos NÃO entram). */
  soma: number;
  /** Quantos `accrual` já existem (base da chave de idempotência). */
  qtd: number;
}

export interface DeltaLancamento extends AlvoLancamento {
  delta_cents: number;
  idempotency_key: string;
}

/** alvo − já lançado (só `accrual`). Delta 0 não gera lançamento. */
export function planejarLancamentos(
  alvos: readonly AlvoLancamento[],
  lancado: ReadonlyMap<string, JaLancado>,
): DeltaLancamento[] {
  const out: DeltaLancamento[] = [];
  for (const a of alvos) {
    const k = chaveTrabalho(a.scope, a.work_day, a.work_week);
    const j = lancado.get(k) ?? { soma: 0, qtd: 0 };
    const delta = a.cents - j.soma;
    if (delta === 0) continue;
    out.push({ ...a, delta_cents: delta, idempotency_key: `acc:${k}:${j.qtd + 1}` });
  }
  return out;
}

/**
 * Semana fechada nunca reabre: o delta de uma semana fechada entra na PRIMEIRA semana ainda aberta depois dela
 * (a que fecha em seguida), para que a tela da semana, o fechamento e o Pix mostrem o mesmo número.
 */
export function semanaDePagamento(workWeek: string, fechadas: ReadonlySet<string>): string {
  let w = workWeek;
  while (fechadas.has(w)) w = addDays(w, 7);
  return w;
}

/** A semana `from` já terminou? (`to` < hoje). */
export const semanaEncerrada = (to: string, hoje: string): boolean => to < hoje;

/** A confirmação tardia de uma semana fechada ainda vale? (`late_grace_days` depois do fim). */
export function dentroDoPrazoTardio(semanaTo: string, hoje: string, lateGraceDays: number): boolean {
  return hoje <= addDays(semanaTo, lateGraceDays);
}

/** Primeiro dia depois de `semanaTo` cujo dia da semana é `payoutWeekday`. */
export function proximoPagamento(semanaTo: string, payoutWeekday: number): string {
  for (let i = 1; i <= 7; i++) {
    const d = addDays(semanaTo, i);
    if (weekdayOf(d) === payoutWeekday) return d;
  }
  return addDays(semanaTo, 1);
}
