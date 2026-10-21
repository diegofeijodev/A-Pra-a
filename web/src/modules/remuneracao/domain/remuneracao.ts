/**
 * Remuneração do consultor (contrato §28) — tipos do fio e funções PURAS de formatação/formulário.
 * Nenhuma regra de valor mora aqui: quem calcula é o servidor (inclusive o simulador). Aqui só se
 * converte reais⇄centavos (sempre inteiros), monta o corpo do PUT e escreve a regra em palavras.
 */
import { z } from 'zod';

export type PeriodoFaixa = 'day' | 'week';
export type Combinacao = 'max' | 'sum' | 'tier_only';
export type CondicaoPiso = 'none' | 'journey_open' | 'min_visits';
export type ContagemVisita = 'checkin' | 'checkout';

export const faixaSchema = z.object({ min_signups: z.number().int(), amount_cents: z.number().int() });

export type FonteCadastro = 'freela_confirmed' | 'declared';
export type CondicaoDiaria = 'none' | 'journey_open' | 'min_visits' | 'route_assigned';
export type ModoFaixa = 'highest' | 'cumulative';

/** As 8 chaves novas (S2/S3, contrato §32.1): opcionais no fio; ausente/nulo = comportamento da regra antiga. */
const chavesNovasSchema = z.object({
  signup_source: z.enum(['freela_confirmed', 'declared']).nullish(),
  daily_base_cents: z.number().int().nullish(),
  daily_base_condition: z.enum(['none', 'journey_open', 'min_visits', 'route_assigned']).nullish(),
  daily_base_min_visits: z.number().int().nullish(),
  daily_base_requires_journey: z.boolean().nullish(),
  tiers_mode: z.enum(['highest', 'cumulative']).nullish(),
  declared_daily_cap: z.number().int().nullish(),
  declared_confirm_days: z.number().int().nullish(),
});

export const regraSchema = z.object({
  unit_cents: z.number().int(),
  tiers_period: z.enum(['day', 'week']),
  tiers: z.array(faixaSchema),
  combine: z.enum(['max', 'sum', 'tier_only']),
  cap_cents: z.number().int().nullable(),
  floor_cents: z.number().int(),
  floor_condition: z.enum(['none', 'journey_open', 'min_visits']),
  floor_min_visits: z.number().int(),
  visits_count: z.enum(['checkin', 'checkout']),
  week_start_weekday: z.number().int(),
  payout_weekday: z.number().int(),
  autoclose_hour: z.number().int(),
  late_grace_days: z.number().int(),
}).extend(chavesNovasSchema.shape);
export type RegraRemuneracao = z.infer<typeof regraSchema>;

/** Padrão das chaves novas = a regra antiga (contrato §32.1). Espelha o servidor; só para preencher o formulário. */
export const NOVAS_PADRAO = {
  signup_source: 'freela_confirmed' as FonteCadastro,
  daily_base_cents: 0,
  daily_base_condition: 'none' as CondicaoDiaria,
  daily_base_min_visits: 0,
  daily_base_requires_journey: true,
  tiers_mode: 'highest' as ModoFaixa,
  declared_daily_cap: null as number | null,
  declared_confirm_days: null as number | null,
};

export const versaoSchema = z.object({
  version: z.number().int(),
  valid_from: z.string(),
  reason: z.string().nullable(),
  created_by: z.string().nullable(),
  created_at: z.string(),
  config: regraSchema,
  /** A regra com todas as chaves (ausentes preenchidas); servidor novo. */
  config_effective: regraSchema.optional(),
});
export type VersaoRegra = z.infer<typeof versaoSchema>;

export const configRespostaSchema = z.object({
  current: versaoSchema,
  upcoming: z.array(versaoSchema),
  history: z.array(versaoSchema),
  default_config: regraSchema,
  /** Presets que só preenchem o formulário (contrato §32.2); servidor antigo não manda. */
  presets: z.object({ completo: regraSchema, chefe: regraSchema }).optional(),
  features: z.object({ routes_enabled: z.boolean(), declared_signups_enabled: z.boolean() }).optional(),
});
export type ConfigResposta = z.infer<typeof configRespostaSchema>;

export const simulacaoSchema = z.object({
  day: z.object({ total_cents: z.number().int(), conta: z.array(z.string()), rule_version: z.number().int().nullable() }),
  week: z
    .object({
      total_cents: z.number().int(),
      days_cents: z.number().int(),
      week_part_cents: z.number().int(),
      days: z.array(z.object({ day: z.string(), total_cents: z.number().int(), conta: z.array(z.string()) })),
      conta: z.array(z.string()),
    })
    .optional(),
});
export type Simulacao = z.infer<typeof simulacaoSchema>;

const diaGanhoSchema = z.object({
  day: z.string(),
  total_cents: z.number().int(),
  confirmed_signups: z.number().int(),
});

export const lancamentoSchema = z.object({
  id: z.string(),
  kind: z.enum(['accrual', 'adjustment', 'reversal']),
  amount_cents: z.number().int(),
  work_scope: z.string(),
  work_day: z.string().nullable(),
  work_week: z.string(),
  payout_week: z.string(),
  rule_version: z.number().int().nullable(),
  source: z.string(),
  reason: z.string().nullable(),
  reverses_id: z.string().nullable(),
  created_by: z.string().nullable(),
  created_at: z.string(),
});
export type Lancamento = z.infer<typeof lancamentoSchema>;

export const extratoSchema = z.object({
  week: z.object({ from: z.string(), to: z.string() }),
  source: z.string(),
  /** Só quando a regra vigente paga o cadastro declarado. */
  signup_source: z.literal('declared').optional(),
  rule_version: z.number().int(),
  confirmation_rule: z.string(),
  total_cents: z.number().int(),
  consultants: z.array(
    z.object({
      consultant_id: z.string(),
      name: z.string(),
      praca_id: z.string(),
      active: z.boolean(),
      status: z.enum(['open', 'closed']),
      total_cents: z.number().int(),
      confirmed_signups: z.number().int(),
      closed_at: z.string().nullable(),
      closed_mode: z.enum(['manual', 'auto']).nullable(),
      week_part_cents: z.number().int(),
      extras_cents: z.number().int(),
      days: z.array(diaGanhoSchema.extend({ visits: z.number().int(), journey_open: z.boolean(), rule_version: z.number().int().nullable(), future: z.boolean(), conta: z.array(z.string()) })),
      conta: z.array(z.string()),
    }),
  ),
  ledger: z.array(lancamentoSchema).optional(),
});
export type Extrato = z.infer<typeof extratoSchema>;
export type ExtratoConsultor = Extrato['consultants'][number];

export const fechamentoSchema = z.object({
  week: z.object({ from: z.string(), to: z.string() }),
  closed: z.number().int(),
  already_closed: z.number().int(),
  total_cents: z.number().int(),
});
export type Fechamento = z.infer<typeof fechamentoSchema>;

export const ganhosCampoSchema = z.object({
  rule_version: z.number().int(),
  confirmation_rule: z.string(),
  source: z.string(),
  signup_source: z.literal('declared').optional(),
  as_of: z.string(),
  today: z.object({ day: z.string(), total_cents: z.number().int(), confirmed_signups: z.number().int(), visits: z.number().int(), journey_open: z.boolean(), conta: z.array(z.string()) }),
  week: z.object({ from: z.string(), to: z.string(), total_cents: z.number().int(), extras_cents: z.number().int(), days: z.array(diaGanhoSchema), conta: z.array(z.string()) }),
  unconfirmed: z.object({ count: z.number().int(), text: z.string() }),
  pix: z.object({ date: z.string(), week_to: z.string(), text: z.string() }),
  previous_weeks: z.array(z.object({ from: z.string(), to: z.string(), total_cents: z.number().int(), status: z.enum(['open', 'closed']) })),
});
export type GanhosCampo = z.infer<typeof ganhosCampoSchema>;

// ── dinheiro: sempre inteiro em centavos ──────────────────────────────────

/** "R$ 1.234,50"; negativo "-R$ 10,00". Só aritmética inteira (igual à do servidor). */
export function brl(cents: number): string {
  const neg = cents < 0;
  const abs = Math.abs(Math.trunc(cents));
  const reais = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${neg ? '-' : ''}R$ ${reais},${String(abs % 100).padStart(2, '0')}`;
}

/** Valor digitado em reais ("10", "10,5", "1.234,50", "R$ 10,00") → centavos inteiros; `null` se inválido. */
export function centavosDeTexto(texto: string): number | null {
  const t = texto.replace(/R\$/gi, '').replace(/\s/g, '');
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(t)) return null;
  const [inteira = '', frac = ''] = t.split(',');
  const reais = Number(inteira.replace(/\./g, ''));
  const cent = Number(frac.padEnd(2, '0'));
  const total = reais * 100 + cent;
  return Number.isSafeInteger(total) ? total : null;
}

/** Centavos → texto para o campo ("10,00"). */
export const textoDeCentavos = (cents: number): string => brl(cents).replace('R$ ', '');

// ── datas ─────────────────────────────────────────────────────────────────

export const DIAS_SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'] as const;
const CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

const diaDaSemana = (dia: string): number => new Date(`${dia}T12:00:00Z`).getUTCDay();
const somaDias = (dia: string, n: number): string => {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** "26/10" */
export const diaMes = (dia: string): string => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
/** "seg 26/10" */
export const rotuloDia = (dia: string): string => `${CURTOS[diaDaSemana(dia)]} ${diaMes(dia)}`;
/** "26/10 a 01/11" */
export const rotuloSemana = (from: string, to: string): string => `${diaMes(from)} a ${diaMes(to)}`;

/** Primeiro dia (≥ hoje) de uma semana de pagamento; para regra semanal a vigência só pode começar nele. */
export function proximoInicioDeSemana(hoje: string, weekStartWeekday: number): string {
  return somaDias(hoje, (weekStartWeekday - diaDaSemana(hoje) + 7) % 7);
}

/** Início sugerido para uma nova versão: hoje, ou o próximo início de semana se a faixa for semanal. */
export function sugerirInicio(hoje: string, regra: Pick<RegraRemuneracao, 'tiers_period' | 'week_start_weekday'>): string {
  return regra.tiers_period === 'week' ? proximoInicioDeSemana(hoje, regra.week_start_weekday) : hoje;
}

// ── formulário ────────────────────────────────────────────────────────────

export interface FormRegra {
  unit: string;
  tiers_period: PeriodoFaixa;
  tiers: Array<{ min: string; valor: string }>;
  combine: Combinacao;
  cap: string;
  floor: string;
  floor_condition: CondicaoPiso;
  floor_min_visits: string;
  visits_count: ContagemVisita;
  week_start_weekday: string;
  payout_weekday: string;
  autoclose_hour: string;
  late_grace_days: string;
  // Modo do chefe (S2/S3, contrato §32.1)
  signup_source: FonteCadastro;
  declared_cap: string;
  daily: string;
  daily_condition: CondicaoDiaria;
  daily_min_visits: string;
  daily_requires_journey: boolean;
  tiers_mode: ModoFaixa;
}

export function regraParaForm(r: RegraRemuneracao): FormRegra {
  const n = {
    signup_source: r.signup_source ?? NOVAS_PADRAO.signup_source,
    daily: r.daily_base_cents ?? NOVAS_PADRAO.daily_base_cents,
    cond: r.daily_base_condition ?? NOVAS_PADRAO.daily_base_condition,
    minv: r.daily_base_min_visits ?? NOVAS_PADRAO.daily_base_min_visits,
    jor: r.daily_base_requires_journey ?? NOVAS_PADRAO.daily_base_requires_journey,
    modo: r.tiers_mode ?? NOVAS_PADRAO.tiers_mode,
    cap: r.declared_daily_cap ?? null,
  };
  return {
    signup_source: n.signup_source,
    declared_cap: n.cap === null ? '' : String(n.cap),
    daily: textoDeCentavos(n.daily),
    daily_condition: n.cond,
    daily_min_visits: String(n.minv),
    daily_requires_journey: n.jor,
    tiers_mode: n.modo,
    unit: textoDeCentavos(r.unit_cents),
    tiers_period: r.tiers_period,
    tiers: r.tiers.map((t) => ({ min: String(t.min_signups), valor: textoDeCentavos(t.amount_cents) })),
    combine: r.combine,
    cap: r.cap_cents === null ? '' : textoDeCentavos(r.cap_cents),
    floor: textoDeCentavos(r.floor_cents),
    floor_condition: r.floor_condition,
    floor_min_visits: String(r.floor_min_visits),
    visits_count: r.visits_count,
    week_start_weekday: String(r.week_start_weekday),
    payout_weekday: String(r.payout_weekday),
    autoclose_hour: String(r.autoclose_hour),
    late_grace_days: String(r.late_grace_days),
  };
}

export type ResultadoForm = { ok: true; regra: RegraRemuneracao } | { ok: false; campo: string; erro: string };

const inteiro = (s: string): number | null => (/^\d+$/.test(s.trim()) ? Number(s.trim()) : null);

/** Converte o formulário em regra (só formato). Os limites e as regras de negócio são conferidos pelo servidor. */
export function formParaRegra(f: FormRegra): ResultadoForm {
  const falha = (campo: string, erro: string): ResultadoForm => ({ ok: false, campo, erro });
  const unit = centavosDeTexto(f.unit);
  if (unit === null) return falha('unit', 'Valor por cadastro: digite em reais, por exemplo 10,00.');
  const tiers: RegraRemuneracao['tiers'] = [];
  for (const [i, t] of f.tiers.entries()) {
    const min = inteiro(t.min);
    const valor = centavosDeTexto(t.valor);
    if (min === null) return falha('tiers', `Faixa ${i + 1}: informe a quantidade de cadastros (número inteiro).`);
    if (valor === null) return falha('tiers', `Faixa ${i + 1}: digite o valor em reais, por exemplo 100,00.`);
    tiers.push({ min_signups: min, amount_cents: valor });
  }
  let cap: number | null = null;
  if (f.cap.trim() !== '') {
    cap = centavosDeTexto(f.cap);
    if (cap === null) return falha('cap', 'Teto: digite em reais ou deixe em branco para não ter teto.');
  }
  const floor = f.floor.trim() === '' ? 0 : centavosDeTexto(f.floor);
  if (floor === null) return falha('floor', 'Piso: digite em reais, ou 0 para não ter piso.');
  const minVisitas = inteiro(f.floor_min_visits || '0');
  if (minVisitas === null) return falha('floor_min_visits', 'Mínimo de visitas: número inteiro.');
  const ws = inteiro(f.week_start_weekday);
  const pw = inteiro(f.payout_weekday);
  const hora = inteiro(f.autoclose_hour);
  const grace = inteiro(f.late_grace_days);
  const diaria = f.daily.trim() === '' ? 0 : centavosDeTexto(f.daily);
  if (diaria === null) return falha('daily', 'Diária: digite em reais, por exemplo 100,00, ou 0 para não ter diária.');
  const minDiaria = inteiro(f.daily_min_visits || '0');
  if (minDiaria === null) return falha('daily_min_visits', 'Mínimo de visitas da diária: número inteiro.');
  let capDecl: number | null = null;
  if (f.declared_cap.trim() !== '') {
    capDecl = inteiro(f.declared_cap);
    if (capDecl === null) return falha('declared_cap', 'Limite diário de declarações: número inteiro ou em branco para não ter limite.');
  }
  // Só manda a chave nova quando ela muda alguma coisa: uma regra "antiga" sai idêntica à de antes (13 chaves).
  const novas: Partial<RegraRemuneracao> = {};
  if (f.signup_source !== NOVAS_PADRAO.signup_source) novas.signup_source = f.signup_source;
  if (f.signup_source === 'declared' && capDecl !== null) novas.declared_daily_cap = capDecl;
  if (diaria > 0) {
    novas.daily_base_cents = diaria;
    novas.daily_base_condition = f.daily_condition;
    novas.daily_base_requires_journey = f.daily_requires_journey;
    if (f.daily_condition === 'min_visits') novas.daily_base_min_visits = minDiaria;
  }
  if (f.tiers_mode !== NOVAS_PADRAO.tiers_mode) novas.tiers_mode = f.tiers_mode;
  if (ws === null || pw === null) return falha('week_start_weekday', 'Escolha o dia da semana.');
  if (hora === null) return falha('autoclose_hour', 'Hora do fechamento: número de 0 a 23.');
  if (grace === null) return falha('late_grace_days', 'Prazo das confirmações tardias: número de dias.');
  return {
    ok: true,
    regra: {
      unit_cents: unit,
      tiers_period: f.tiers_period,
      tiers,
      combine: f.combine,
      cap_cents: cap,
      floor_cents: floor,
      floor_condition: f.floor_condition,
      floor_min_visits: minVisitas,
      visits_count: f.visits_count,
      week_start_weekday: ws,
      payout_weekday: pw,
      autoclose_hour: hora,
      late_grace_days: grace,
      ...novas,
    },
  };
}

const cadastros = (n: number) => `${n} ${n === 1 ? 'cadastro' : 'cadastros'}`;

/** A regra em palavras (para quem lê a tela sem decifrar campos). */
export function resumoRegra(r: RegraRemuneracao): string[] {
  const linhas: string[] = [];
  const periodo = r.tiers_period === 'day' ? 'no dia' : 'na semana';
  const declarado = r.signup_source === 'declared';
  const cumulativo = r.tiers_mode === 'cumulative';
  if (r.combine === 'tier_only') linhas.push('O valor por cadastro não é usado: só vale a faixa atingida.');
  else
    linhas.push(
      declarado
        ? `Cada cadastro declarado pelo consultor na visita vale ${brl(r.unit_cents)}${r.declared_daily_cap ? ` (até ${r.declared_daily_cap} por dia)` : ''}.`
        : `Cada cadastro confirmado pelo Freela vale ${brl(r.unit_cents)}.`,
    );
  if (r.tiers.length) {
    linhas.push(`${cumulativo ? 'Metas' : 'Faixas'} ${periodo}: ${r.tiers.map((t) => `${cadastros(t.min_signups)} = ${brl(t.amount_cents)}`).join('; ')}.`);
    if (cumulativo) linhas.push('Todas as metas atingidas somam (a meta de 10 não substitui a de 5).');
    if (r.combine === 'max') linhas.push(`Vale o maior entre o valor por cadastro e ${cumulativo ? 'a soma das metas atingidas' : 'a faixa atingida'}.`);
    if (r.combine === 'sum') linhas.push(`O valor por cadastro soma com ${cumulativo ? 'a soma das metas atingidas' : 'a faixa atingida'}.`);
  } else {
    linhas.push('Não há faixas.');
  }
  if (r.cap_cents !== null) linhas.push(`Teto ${r.tiers_period === 'day' ? 'por dia' : 'por semana'}: ${brl(r.cap_cents)}.`);
  if (r.floor_cents > 0) {
    const cond =
      r.floor_condition === 'none'
        ? 'todo dia, para consultor ativo (mesmo sem visitas)'
        : r.floor_condition === 'journey_open'
          ? 'nos dias em que houve jornada iniciada'
          : `nos dias com ao menos ${r.floor_min_visits} ${r.floor_min_visits === 1 ? 'visita' : 'visitas'} (${r.visits_count === 'checkin' ? 'contadas no check-in' : 'contadas só com checkout'})`;
    linhas.push(`Piso por diária: ${brl(r.floor_cents)}, ${cond}.`);
  } else {
    linhas.push('Sem piso por diária.');
  }
  if ((r.daily_base_cents ?? 0) > 0) {
    const cond: Record<string, string> = {
      none: 'todo dia de consultor ativo',
      journey_open: 'nos dias com jornada iniciada',
      min_visits: `nos dias com ao menos ${r.daily_base_min_visits ?? 0} visita(s)`,
      route_assigned: 'nos dias com rota da equipe atribuída',
    };
    linhas.push(
      `Diária de ${brl(r.daily_base_cents as number)}, ${cond[r.daily_base_condition ?? 'none']}${(r.daily_base_requires_journey ?? true) && r.daily_base_condition !== 'journey_open' ? ' e com jornada iniciada' : ''}; soma ao resto, fora do piso e do teto.`,
    );
  }
  linhas.push(`Semana de ${DIAS_SEMANA[r.week_start_weekday]} a ${DIAS_SEMANA[(r.week_start_weekday + 6) % 7]} (Brasília); Pix toda ${DIAS_SEMANA[r.payout_weekday]}, fechamento automático a partir das ${r.autoclose_hour}h.`);
  linhas.push(`Confirmação que chega depois do fechamento ainda vale por ${r.late_grace_days} dias, como ajuste na semana corrente.`);
  return linhas;
}

export interface ParamsSimulacao {
  signups: string;
  visits: string;
  journey_open: boolean;
  route_assigned?: boolean;
  /** Simulação da SEMANA (contrato §32.3): um item por dia, a partir do 1º dia da semana. */
  days?: Array<{ signups: string; route_assigned: boolean }>;
}

export interface CorpoSimulacao {
  config: RegraRemuneracao;
  signups_confirmed: number;
  visits: number;
  journey_open: boolean;
  route_assigned?: boolean;
  days?: Array<{ signups: number; route_assigned: boolean; journey_open: boolean }>;
}

/** Corpo do `POST …/simulate`; `null` enquanto o formulário ou os números não forem válidos. */
export function corpoSimulacao(f: FormRegra, p: ParamsSimulacao): CorpoSimulacao | null {
  const regra = formParaRegra(f);
  const n = inteiro(p.signups);
  const v = inteiro(p.visits || '0');
  if (!regra.ok || n === null || v === null || n > 1000 || v > 1000) return null;
  const corpo: CorpoSimulacao = { config: regra.regra, signups_confirmed: n, visits: v, journey_open: p.journey_open };
  if (p.route_assigned) corpo.route_assigned = true;
  if (p.days?.length) {
    const dias: NonNullable<CorpoSimulacao['days']> = [];
    for (const d of p.days.slice(0, 7)) {
      const x = inteiro(d.signups || '0');
      if (x === null || x > 1000) return null;
      dias.push({ signups: x, route_assigned: d.route_assigned, journey_open: p.journey_open });
    }
    corpo.days = dias;
  }
  return corpo;
}

/** "Com 12 cadastros num dia, o consultor ganha R$ 120,00." */
export const tituloSimulacao = (signups: number, totalCents: number): string =>
  `Com ${cadastros(signups)} ${signups === 1 ? 'confirmado' : 'confirmados'} num dia, o consultor ganha ${brl(totalCents)}.`;

export function rotuloStatus(s: 'open' | 'closed'): string {
  return s === 'closed' ? 'Fechada' : 'Aberta';
}
