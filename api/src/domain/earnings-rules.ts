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

/** Modo do chefe S2 (contrato §32): chaves OPCIONAIS da regra. Ausente = comportamento da v1 (nada muda). */
export const FONTES_CADASTRO = ['freela_confirmed', 'declared'] as const;
export type FonteCadastro = (typeof FONTES_CADASTRO)[number];
export const CONDICOES_DIARIA = ['none', 'journey_open', 'min_visits', 'route_assigned'] as const;
export type CondicaoDiaria = (typeof CONDICOES_DIARIA)[number];
export const MODOS_FAIXA = ['highest', 'cumulative'] as const;
export type ModoFaixa = (typeof MODOS_FAIXA)[number];

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

/** As 8 chaves da S2/S3. Todas opcionais na regra gravada/enviada; `normalizarRegra` preenche o padrão. */
export interface ChavesNovas {
  /** De onde vem o "cadastro" que paga. */
  signup_source: FonteCadastro;
  /** Diária ADITIVA (não é piso), em centavos; 0 = sem diária. */
  daily_base_cents: number;
  daily_base_condition: CondicaoDiaria;
  daily_base_min_visits: number;
  /** Além da condição, exige jornada iniciada no dia. */
  daily_base_requires_journey: boolean;
  /** `highest`: vale a maior faixa atingida · `cumulative`: soma todas as faixas atingidas. */
  tiers_mode: ModoFaixa;
  /** Limite diário de cadastros declarados que entram na conta; null = sem limite. */
  declared_daily_cap: number | null;
  /** Reservado à anulação automática (S4, desligada): dias sem confirmação do Freela; null = desligado. */
  declared_confirm_days: number | null;
}

/** A regra como é gravada e lida: as 13 chaves da v1 + as novas que existirem (cruas, sem preencher). */
export type RegraBruta = RegraRemuneracao & Partial<ChavesNovas>;
/** A regra completa, pronta para calcular. */
export type RegraNormalizada = RegraRemuneracao & ChavesNovas;

export interface VersaoRegra {
  version: number;
  valid_from: string;
  config: RegraBruta;
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

/**
 * Padrão das chaves novas = o comportamento ATUAL (v1): fonte confirmada pelo Freela, sem diária, maior faixa.
 * `daily_base_requires_journey = true` só vale quando alguém liga a diária e não diz o contrário.
 */
export const CHAVES_NOVAS_PADRAO: ChavesNovas = {
  signup_source: 'freela_confirmed',
  daily_base_cents: 0,
  daily_base_condition: 'none',
  daily_base_min_visits: 0,
  daily_base_requires_journey: true,
  tiers_mode: 'highest',
  declared_daily_cap: null,
  declared_confirm_days: null,
};
export const CHAVES_REGRA_NOVAS = Object.keys(CHAVES_NOVAS_PADRAO) as (keyof ChavesNovas)[];

export const LIMITES_REGRA_NOVOS = {
  daily_base_cents: { min: 0, max: 10_000_000 },
  daily_base_min_visits: { min: 0, max: 1000 },
  declared_daily_cap: { min: 1, max: 1000 },
  declared_confirm_days: { min: 1, max: 91 },
} as const;

/**
 * Presets do formulário da equipe (contrato §32.4). O servidor NÃO conhece "perfil": só entrega estas configs para o
 * web preencher o formulário; quem publica é o admin, por nova versão.
 *  - `completo`: a regra atual (v1) com as chaves novas explícitas nos padrões.
 *  - `chefe`: o COMPORTAMENTO da versão Lovable (`src/lib/financeiro.ts`, `calcularPagamento`): diária por dia com rota da
 *    equipe (sem exigir presença), comissão por cadastro DECLARADO, bônus por meta que SOMAM (cumulativo), contados
 *    na semana (o `periodo` padrão de `regras_bonus` é 'semana'). A Lovable NÃO traz valores padrão: diária,
 *    comissão e metas são cadastrados por representante e nascem em 0 (`representantes.valor_diaria`,
 *    `valor_comissao_cadastro`, `regras_bonus.meta/valor` default 0). Por isso os valores em dinheiro vão zerados
 *    para o admin preencher; `declared_daily_cap = 30` é a meta diária do nosso campo (`meta_diaria`), uma
 *    salvaguarda nossa, não da Lovable.
 */
export const PRESET_COMPLETO: RegraNormalizada = { ...REGRA_PADRAO, tiers: REGRA_PADRAO.tiers.map((t) => ({ ...t })), ...CHAVES_NOVAS_PADRAO };
export const PRESET_CHEFE: RegraNormalizada = {
  ...REGRA_PADRAO,
  unit_cents: 0,
  tiers_period: 'week',
  tiers: [],
  combine: 'sum',
  signup_source: 'declared',
  daily_base_cents: 0,
  daily_base_condition: 'route_assigned',
  daily_base_min_visits: 0,
  daily_base_requires_journey: false,
  tiers_mode: 'cumulative',
  declared_daily_cap: 30,
  declared_confirm_days: null,
};

/** Regra completa: chave ausente (ou null) vira o comportamento atual. NÃO muda a regra de entrada. */
export function normalizarRegra(r: RegraBruta): RegraNormalizada {
  const n = { ...CHAVES_NOVAS_PADRAO } as Record<string, unknown>;
  for (const k of CHAVES_REGRA_NOVAS) if (r[k] !== undefined && r[k] !== null) n[k] = r[k];
  return { ...r, ...(n as unknown as ChavesNovas) };
}

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
  { ok: true; regra: RegraBruta } | { ok: false; campo: string; erro: string };

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
    if (!(CHAVES_REGRA as string[]).includes(k) && !(CHAVES_REGRA_NOVAS as string[]).includes(k))
      return falha(k, 'campo desconhecido.');
  for (const k of CHAVES_REGRA) if (o[k] === undefined) return falha(k, 'obrigatório.');
  const L = LIMITES_REGRA;
  // Chaves novas (S2/S3): opcionais; `null` vale como ausente (o web atual reenvia o que recebeu).
  const N = LIMITES_REGRA_NOVOS;
  const nv = (k: keyof ChavesNovas): unknown => (o[k] === null ? undefined : o[k]);
  if (nv('signup_source') !== undefined && !oneOf(FONTES_CADASTRO, nv('signup_source')))
    return falha('signup_source', 'use freela_confirmed ou declared.');
  if (nv('daily_base_cents') !== undefined && !ehInt(nv('daily_base_cents'), N.daily_base_cents.min, N.daily_base_cents.max))
    return falha('daily_base_cents', `inteiro em centavos de ${N.daily_base_cents.min} a ${N.daily_base_cents.max} (0 = sem diária).`);
  if (nv('daily_base_condition') !== undefined && !oneOf(CONDICOES_DIARIA, nv('daily_base_condition')))
    return falha('daily_base_condition', 'use none, journey_open, min_visits ou route_assigned.');
  if (nv('daily_base_min_visits') !== undefined && !ehInt(nv('daily_base_min_visits'), N.daily_base_min_visits.min, N.daily_base_min_visits.max))
    return falha('daily_base_min_visits', 'inteiro de 0 a 1000.');
  if (nv('daily_base_requires_journey') !== undefined && typeof nv('daily_base_requires_journey') !== 'boolean')
    return falha('daily_base_requires_journey', 'use true ou false.');
  if (nv('tiers_mode') !== undefined && !oneOf(MODOS_FAIXA, nv('tiers_mode')))
    return falha('tiers_mode', 'use highest ou cumulative.');
  if (nv('declared_daily_cap') !== undefined && !ehInt(nv('declared_daily_cap'), N.declared_daily_cap.min, N.declared_daily_cap.max))
    return falha('declared_daily_cap', `inteiro de ${N.declared_daily_cap.min} a ${N.declared_daily_cap.max} ou null (sem limite).`);
  if (nv('declared_confirm_days') !== undefined && !ehInt(nv('declared_confirm_days'), N.declared_confirm_days.min, N.declared_confirm_days.max))
    return falha('declared_confirm_days', `inteiro de ${N.declared_confirm_days.min} a ${N.declared_confirm_days.max} ou null (desligado).`);
  const cumulativo = nv('tiers_mode') === 'cumulative';
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
    // No modo cumulativo o valor de cada meta é um ADICIONAL (soma), então pode ser menor que o da anterior.
    if (!cumulativo && ant && f.amount_cents < ant.amount_cents)
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
  if (nv('daily_base_condition') === 'min_visits' && ((nv('daily_base_cents') as number | undefined) ?? 0) > 0 && !((nv('daily_base_min_visits') as number | undefined) ?? 0))
    return falha('daily_base_min_visits', 'com a condição min_visits informe ao menos 1 visita.');
  if (nv('declared_confirm_days') !== undefined && (nv('declared_confirm_days') as number) >= o.late_grace_days)
    return falha('declared_confirm_days', 'precisa ser menor que late_grace_days, senão a anulação cairia fora do prazo e nada seria lançado.');
  const novas: Partial<ChavesNovas> = {};
  for (const k of CHAVES_REGRA_NOVAS) {
    const v = nv(k);
    if (v !== undefined) (novas as Record<string, unknown>)[k] = v;
  }
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
      ...novas,
    },
  };
}

/** JSON já salvo (validado ao entrar). Se estiver corrompido, falha alto: pagar com regra errada é pior que parar. */
export function lerRegraSalva(raw: unknown): RegraBruta {
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
  nova: RegraBruta;
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
  /** Cadastros que pagam no dia (confirmados pelo Freela ou declarados, conforme `signup_source` do dia). */
  signups: number;
  /** Visitas do dia conforme `visits_count`. */
  visits: number;
  /** Houve jornada iniciada no dia. */
  journey_open: boolean;
  /** Consultor existia e está ativo (condição `none` do piso). */
  elegivel: boolean;
  /** S2: o consultor tinha rota da EQUIPE atribuída no dia (`daily_base_condition = route_assigned`). */
  route_assigned?: boolean;
  /** S3: declarações do dia acima de `declared_daily_cap` (não entram em `signups`). */
  declared_over_cap?: number;
  /** S3: declarações do dia anuladas (já fora de `signups`). */
  declared_voided?: number;
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
  /** Só presentes quando a regra usa o recurso (a v1 não ganha chave nova). */
  diaria_cents?: number;
  declared_over_cap?: number;
  declared_voided?: number;
}

export function faixaAtingida(tiers: readonly Faixa[], n: number): Faixa | null {
  let r: Faixa | null = null;
  for (const t of tiers) if (n >= t.min_signups && (!r || t.min_signups > r.min_signups)) r = t;
  return r;
}

/** Todas as faixas atingidas (modo cumulativo), da menor para a maior. */
export function faixasAtingidas(tiers: readonly Faixa[], n: number): Faixa[] {
  return tiers.filter((t) => n >= t.min_signups).sort((a, b) => a.min_signups - b.min_signups);
}

/** Valor da(s) faixa(s) para `n` cadastros: a maior (`highest`) ou a soma de todas (`cumulative`). */
export function valorDasFaixas(regra: RegraNormalizada, n: number): number {
  if (regra.tiers_mode === 'cumulative') return faixasAtingidas(regra.tiers, n).reduce((a, t) => a + t.amount_cents, 0);
  return faixaAtingida(regra.tiers, n)?.amount_cents ?? 0;
}

export function proximaFaixa(tiers: readonly Faixa[], n: number): ProximaFaixa | null {
  let r: Faixa | null = null;
  for (const t of tiers) if (t.min_signups > n && (!r || t.min_signups < r.min_signups)) r = t;
  return r ? { ...r, faltam: r.min_signups - n } : null;
}

/** Rótulo do cadastro que paga: "confirmado" (Freela, v1) ou "declarado" (S3). */
function rotuloCadastro(r: RegraNormalizada, n: number): string {
  return r.signup_source === 'declared'
    ? plural(n, 'cadastro declarado', 'cadastros declarados')
    : plural(n, 'cadastro confirmado', 'cadastros confirmados');
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

function condicaoDiariaTexto(r: RegraNormalizada): string {
  const partes: string[] = [];
  if (r.daily_base_condition === 'route_assigned') partes.push('rota da equipe atribuída no dia');
  else if (r.daily_base_condition === 'min_visits')
    partes.push(`ao menos ${plural(r.daily_base_min_visits, 'visita', 'visitas')} no dia`);
  else if (r.daily_base_condition === 'journey_open') partes.push('jornada iniciada no dia');
  else partes.push('dia de consultor ativo');
  if (r.daily_base_requires_journey && r.daily_base_condition !== 'journey_open')
    partes.push('jornada iniciada no dia');
  return partes.join(' e ');
}

/** A diária ADITIVA vale neste dia? (todas as condições configuradas precisam valer). */
function diariaVale(r: RegraNormalizada, e: EntradaDia): { vale: boolean; motivo: string | null } {
  if (r.daily_base_cents <= 0) return { vale: false, motivo: null };
  if (r.daily_base_condition === 'none' && !e.elegivel)
    return { vale: false, motivo: 'o consultor não está ativo' };
  if (r.daily_base_condition === 'route_assigned' && !e.route_assigned)
    return { vale: false, motivo: 'não havia rota da equipe atribuída no dia' };
  if (r.daily_base_condition === 'min_visits' && e.visits < r.daily_base_min_visits)
    return { vale: false, motivo: `foram ${plural(e.visits, 'visita', 'visitas')} e o mínimo é ${r.daily_base_min_visits}` };
  if ((r.daily_base_condition === 'journey_open' || r.daily_base_requires_journey) && !e.journey_open)
    return { vale: false, motivo: 'não houve jornada iniciada no dia' };
  return { vale: true, motivo: null };
}

/**
 * Valor de UM dia com a regra que vigora nele.
 * Ordem: núcleo (cadastros × valor, faixa/metas) → piso → teto → + diária ADITIVA (a diária fica fora do piso e do teto).
 * Aceita a regra crua (v1 ou com chaves novas): normaliza antes.
 */
export function calcularDia(
  regraBruta: RegraBruta,
  e: EntradaDia,
  version: number | null = null,
): ResultadoDia {
  const regra = normalizarRegra(regraBruta);
  const n = e.signups;
  const porCadastro = regra.combine === 'tier_only' ? 0 : n * regra.unit_cents;
  const diaria = regra.tiers_period === 'day';
  const faixa = diaria ? faixaAtingida(regra.tiers, n) : null;
  const faixaCents = diaria ? valorDasFaixas(regra, n) : 0;
  const nucleo = !diaria
    ? porCadastro
    : regra.combine === 'max'
      ? Math.max(porCadastro, faixaCents)
      : porCadastro + faixaCents;
  const piso = pisoVale(regra, e);
  const comPiso = piso.vale ? Math.max(nucleo, regra.floor_cents) : nucleo;
  const comTeto = diaria && regra.cap_cents !== null ? Math.min(comPiso, regra.cap_cents) : comPiso;
  const pisoAplicado = piso.vale && regra.floor_cents > nucleo;
  const tetoAplicado = diaria && regra.cap_cents !== null && comPiso > regra.cap_cents;
  const prox = diaria ? proximaFaixa(regra.tiers, n) : null;
  const dv = diariaVale(regra, e);
  const diariaCents = dv.vale ? regra.daily_base_cents : 0;
  const total = comTeto + diariaCents;
  const cumulativo = regra.tiers_mode === 'cumulative';

  const conta: string[] = [];
  if (regra.combine === 'tier_only') {
    conta.push(
      `${rotuloCadastro(regra, n)}; nesta regra só vale a faixa, não o valor por cadastro.`,
    );
  } else {
    conta.push(`${rotuloCadastro(regra, n)} × ${brl(regra.unit_cents)} = ${brl(porCadastro)}.`);
  }
  if ((e.declared_over_cap ?? 0) > 0 && regra.declared_daily_cap !== null)
    conta.push(
      `Limite diário de ${plural(regra.declared_daily_cap, 'cadastro declarado', 'cadastros declarados')}: ${plural(e.declared_over_cap as number, 'declaração acima do limite não entra', 'declarações acima do limite não entram')} na conta.`,
    );
  if ((e.declared_voided ?? 0) > 0)
    conta.push(
      `${plural(e.declared_voided as number, 'declaração anulada', 'declarações anuladas')} no dia (não ${(e.declared_voided as number) === 1 ? 'entra' : 'entram'} na conta).`,
    );
  if (diaria) {
    if (cumulativo) {
      const atingidas = faixasAtingidas(regra.tiers, n);
      if (atingidas.length > 0)
        conta.push(
          `Metas atingidas (todas somam): ${atingidas.map((t) => `${plural(t.min_signups, 'cadastro', 'cadastros')} = ${brl(t.amount_cents)}`).join('; ')}. Soma das metas: ${brl(faixaCents)}.`,
        );
    } else if (faixa) {
      conta.push(
        `Faixa atingida: ${plural(faixa.min_signups, 'cadastro', 'cadastros')} = ${brl(faixa.amount_cents)}.`,
      );
    }
    if (faixa && regra.combine === 'max' && porCadastro > 0) conta.push(`Vale o maior: ${brl(nucleo)}.`);
    if (faixa && regra.combine !== 'max' && porCadastro > 0)
      conta.push(`Soma do valor por cadastro com a ${cumulativo ? 'soma das metas' : 'faixa'}: ${brl(nucleo)}.`);
    if (prox)
      conta.push(
        `Faltam ${rotuloCadastro(regra, prox.faltam)} para a ${cumulativo ? 'meta' : 'faixa'} de ${brl(prox.amount_cents)} (${plural(prox.min_signups, 'cadastro', 'cadastros')}).`,
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
      `Teto do dia de ${brl(regra.cap_cents as number)} aplicado: o valor cai de ${brl(comPiso)} para ${brl(comTeto)}.`,
    );
  if (regra.daily_base_cents > 0) {
    conta.push(
      dv.vale
        ? `Diária de ${brl(regra.daily_base_cents)} (${condicaoDiariaTexto(regra)}), somada ao valor acima: ${brl(comTeto)} + ${brl(diariaCents)} = ${brl(total)}.`
        : `Diária de ${brl(regra.daily_base_cents)} não vale: ${dv.motivo}.`,
    );
  }
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
    ...(regra.daily_base_cents > 0 ? { diaria_cents: diariaCents } : {}),
    ...((e.declared_over_cap ?? 0) > 0 ? { declared_over_cap: e.declared_over_cap } : {}),
    ...((e.declared_voided ?? 0) > 0 ? { declared_voided: e.declared_voided } : {}),
  };
}

export interface ResultadoSemana {
  from: string;
  to: string;
  rule_version: number | null;
  days: ResultadoDia[];
  signups_week: number;
  /** Soma dos dias (já com piso e diária; teto só nos dias de faixa diária). */
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
 * a parte semanal usa a versão vigente no primeiro dia da semana. A diária aditiva fica FORA da faixa
 * e do teto semanais: eles se aplicam à soma dos núcleos dos dias.
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
  const diariasCents = days.reduce((a, d) => a + (d.diaria_cents ?? 0), 0);
  const nucleosCents = daysCents - diariasCents;
  const signupsWeek = days.reduce((a, d) => a + d.signups, 0);
  const rs = vSemana ? normalizarRegra(vSemana.config) : undefined;
  const conta: string[] = [];
  for (const d of days) {
    if (d.futuro) continue;
    const dr = normalizarRegra(versaoVigente(p.versoes, d.dia)?.config ?? (rs as RegraBruta));
    conta.push(`${rotuloDia(d.dia)}: ${brl(d.total_cents)} (${rotuloCadastro(dr, d.signups)}).`);
  }
  if (diariasCents > 0) conta.push(`Diárias da semana: ${brl(diariasCents)} (já somadas nos dias).`);
  conta.push(`Soma dos dias: ${brl(daysCents)}.`);

  let parte = 0;
  if (rs && rs.tiers_period === 'week') {
    const faixa = faixaAtingida(rs.tiers, signupsWeek);
    const faixaCents = valorDasFaixas(rs, signupsWeek);
    const cumulativo = rs.tiers_mode === 'cumulative';
    const pre = rs.combine === 'max' ? Math.max(nucleosCents, faixaCents) : nucleosCents + faixaCents;
    const semana = rs.cap_cents !== null ? Math.min(pre, rs.cap_cents) : pre;
    parte = semana - nucleosCents;
    const base = diariasCents > 0 ? 'a soma dos dias (sem as diárias)' : 'a soma dos dias';
    if (faixa) {
      if (cumulativo) {
        const atingidas = faixasAtingidas(rs.tiers, signupsWeek);
        conta.push(
          `Metas semanais atingidas (todas somam): ${atingidas.map((t) => `${plural(t.min_signups, 'cadastro', 'cadastros')} = ${brl(t.amount_cents)}`).join('; ')}. Soma das metas: ${brl(faixaCents)} (a semana teve ${rotuloCadastro(rs, signupsWeek)}).`,
        );
      } else {
        conta.push(
          `Faixa semanal atingida: ${plural(faixa.min_signups, 'cadastro', 'cadastros')} na semana = ${brl(faixa.amount_cents)} (a semana teve ${rotuloCadastro(rs, signupsWeek)}).`,
        );
      }
      conta.push(
        rs.combine === 'max'
          ? `Vale o maior entre ${base} e a ${cumulativo ? 'soma das metas' : 'faixa'}: ${brl(Math.max(nucleosCents, faixaCents))}.`
          : `Soma dos dias${diariasCents > 0 ? ' (sem as diárias)' : ''} com a ${cumulativo ? 'soma das metas' : 'faixa'}: ${brl(nucleosCents + faixaCents)}.`,
      );
    } else {
      const prox = proximaFaixa(rs.tiers, signupsWeek);
      if (prox)
        conta.push(
          `Faltam ${rotuloCadastro(rs, prox.faltam)} na semana para a ${cumulativo ? 'meta' : 'faixa'} semanal de ${brl(prox.amount_cents)}.`,
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
