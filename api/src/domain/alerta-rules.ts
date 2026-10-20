/**
 * Meta do dia e "Atenção agora" da equipe — contrato §25.
 *
 * Funções PURAS: o serviço lê as linhas, passa a hora de Brasília em minutos
 * (`agoraMin`) e o dia; nada aqui consulta banco nem relógio. Todo alerta traz a
 * mensagem E a conta feita (regra do dono: número sempre com a conta e a fonte).
 */
import { minutesSp } from '../common/time/dates';
import type { SituacaoHoje } from './campo-rules';
import { minParaHhmm, paramsDaConfig, ritmo, type ConfigRota, type ParamsPlano, type Ritmo } from './rota-rules';

// ── limiares (app_settings.field_config) ────────────────────

export interface ConfigAlertas {
  alerta_inicio_apos_min: number;
  alerta_visita_aberta_min: number;
  alerta_sem_registro_min: number;
  alerta_ritmo_atras: number;
  alerta_parada_vencida_min: number;
  /** 0 = domingo … 6 = sábado (Brasília). */
  dias_trabalho: number[];
  retornos_no_roteiro: boolean;
  /** F9 (contrato §29.3): marcar Pix como pago exige comprovante. */
  payout_proof_required: boolean;
}

export const CONFIG_ALERTAS_PADRAO: ConfigAlertas = {
  alerta_inicio_apos_min: 30,
  alerta_visita_aberta_min: 40,
  alerta_sem_registro_min: 30,
  alerta_ritmo_atras: 5,
  alerta_parada_vencida_min: 30,
  dias_trabalho: [1, 2, 3, 4, 5, 6],
  retornos_no_roteiro: true,
  payout_proof_required: true,
};

const inteiro = (min: number, max: number) => (v: unknown) => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
const diasValidos = (v: unknown) =>
  Array.isArray(v) && v.length >= 1 && v.length <= 7 && v.every((d) => Number.isInteger(d) && d >= 0 && d <= 6) && new Set(v).size === v.length;

const VALIDADORES_ALERTAS: Record<keyof ConfigAlertas, (v: unknown) => boolean> = {
  alerta_inicio_apos_min: inteiro(0, 240),
  alerta_visita_aberta_min: inteiro(5, 480),
  alerta_sem_registro_min: inteiro(5, 480),
  alerta_ritmo_atras: inteiro(1, 100),
  alerta_parada_vencida_min: inteiro(5, 240),
  dias_trabalho: diasValidos,
  retornos_no_roteiro: (v) => typeof v === 'boolean',
  payout_proof_required: (v) => typeof v === 'boolean',
};

export const CHAVES_CONFIG_ALERTAS = Object.keys(VALIDADORES_ALERTAS) as (keyof ConfigAlertas)[];

export const ehChaveDeAlertas = (k: string): k is keyof ConfigAlertas => k in VALIDADORES_ALERTAS;

const ordenados = (d: number[]) => [...d].sort((a, b) => a - b);

/** Chave ausente ou inválida cai no padrão (o JSON pode ter sido editado à mão). */
export function lerConfigAlertas(raw: unknown): ConfigAlertas {
  const base = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const c: Record<string, unknown> = { ...CONFIG_ALERTAS_PADRAO };
  for (const k of CHAVES_CONFIG_ALERTAS) if (VALIDADORES_ALERTAS[k](base[k])) c[k] = base[k];
  const cfg = c as unknown as ConfigAlertas;
  return { ...cfg, dias_trabalho: ordenados(cfg.dias_trabalho) };
}

/** Valida um PUT parcial só com chaves de alerta. */
export function aplicarConfigAlertas(atual: ConfigAlertas, parcial: Record<string, unknown>): { ok: true; config: ConfigAlertas } | { ok: false; erro: string } {
  const novo: Record<string, unknown> = { ...atual };
  for (const [k, v] of Object.entries(parcial)) {
    if (!ehChaveDeAlertas(k)) return { ok: false, erro: `${k}: campo desconhecido.` };
    if (!VALIDADORES_ALERTAS[k](v)) return { ok: false, erro: `${k}: valor fora do permitido.` };
    novo[k] = v;
  }
  const cfg = novo as unknown as ConfigAlertas;
  return { ok: true, config: { ...cfg, dias_trabalho: ordenados(cfg.dias_trabalho) } };
}

/** Hoje é dia de trabalho? `diaSemana`: 0 = domingo … 6 = sábado, de `weekdayOf(todaySp())`. */
export const ehDiaDeTrabalho = (diaSemana: number, c: Pick<ConfigAlertas, 'dias_trabalho'>): boolean => c.dias_trabalho.includes(diaSemana);

// ── texto ───────────────────────────────────────────────────

/** 480 → "8 h"; 510 → "8 h 30 min"; 45 → "45 min". */
export function duracao(min: number): string {
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r === 0 ? `${h} h` : `${h} h ${r} min`;
}

const minutosEntre = (de: Date, ate: Date): number => Math.max(0, Math.floor((ate.getTime() - de.getTime()) / 60_000));
const horaDe = (d: Date): string => minParaHhmm(minutesSp(d));

// ── meta e ritmo ────────────────────────────────────────────

export interface GoalView {
  meta: number;
  feitas: number;
  esperadas: number;
  /** Positivo = à frente. */
  delta: number;
  faltam: number;
  minutos_uteis: number;
  minutos_por_visita_ritmo: number;
  dia_de_trabalho: boolean;
  conta: string;
  fonte: string;
}

export const FONTE_META =
  'Feitas = visitas com check-in nas jornadas de hoje (inclui a aberta e as sem checkout; pulada ou adiada do roteiro não conta). Meta e horários = configuração do roteiro.';

/** A conta em frase: "30 visitas em 8 h úteis (09:00–18:00, menos 1 h de almoço) = 1 a cada 16 min. …". */
export function contaDaMeta(p: ParamsPlano, agoraMin: number, r: Ritmo, minutosUteis: number): string {
  const almoco = Math.max(p.almocoFim - p.almocoIni, 0);
  const total = p.janelaFim - p.janelaIni - almoco;
  const janela = `${minParaHhmm(p.janelaIni)}–${minParaHhmm(p.janelaFim)}`;
  const base = `${p.meta} visitas em ${duracao(total)} úteis (${janela}, menos ${duracao(almoco)} de almoço) = 1 a cada ${r.minutos_por_visita_ritmo} min.`;
  const t = Math.min(Math.max(agoraMin, p.janelaIni), p.janelaFim);
  return `${base} Às ${minParaHhmm(t)} já deveriam ser ${r.esperadas} (${minutosUteis} min úteis ÷ ${r.minutos_por_visita_ritmo} min); feitas: ${r.feitas}.`;
}

export function metaDoDia(e: { agoraMin: number; feitas: number; config: ConfigRota; diaDeTrabalho: boolean }): GoalView {
  const params = paramsDaConfig(e.config);
  const r = ritmo({ agoraMin: e.agoraMin, feitas: e.feitas, params });
  const t = Math.min(Math.max(e.agoraMin, params.janelaIni), params.janelaFim);
  const almocoPassado = Math.max(0, Math.min(t, params.almocoFim) - params.almocoIni);
  const minutosUteis = t - params.janelaIni - almocoPassado;
  return {
    meta: r.meta,
    feitas: r.feitas,
    esperadas: r.esperadas,
    delta: r.delta,
    faltam: r.faltam,
    minutos_uteis: minutosUteis,
    minutos_por_visita_ritmo: r.minutos_por_visita_ritmo,
    dia_de_trabalho: e.diaDeTrabalho,
    conta: contaDaMeta(params, e.agoraMin, r, minutosUteis),
    fonte: FONTE_META,
  };
}

// ── alertas ─────────────────────────────────────────────────

export type CodigoAlerta = 'nao_iniciou' | 'sem_registro' | 'visita_aberta' | 'ritmo_atrasado' | 'parada_vencida';
export type SeveridadeAlerta = 'alta' | 'media';

export interface Alerta {
  code: CodigoAlerta;
  severity: SeveridadeAlerta;
  consultant_id: string;
  consultant_name: string;
  praca_id: string;
  praca_name: string;
  phone: string;
  message: string;
  conta: string;
  since: string | null;
}

export interface EntradaConsultor {
  id: string;
  name: string;
  phone: string;
  praca_id: string;
  praca_name: string;
  active: boolean;
  situacao: SituacaoHoje;
  /** Maior entre ponto, check-in, checkout e início da jornada ABERTA; nulo sem jornada aberta. */
  ultimoRegistro: Date | null;
  visitaAberta: { nome: string; checkin_at: Date } | null;
  /** Visitas de hoje (abertas, fechadas e sem checkout). */
  feitas: number;
  /** Paradas pendentes/planejadas do roteiro ativo de hoje; `null` = sem roteiro (ou roteiro desligado). */
  paradasPendentes: { nome: string; eta_min: number }[] | null;
}

export interface EntradaAlertas {
  agora: Date;
  agoraMin: number;
  /** 0 = domingo … 6 = sábado (Brasília). */
  diaSemana: number;
  config: ConfigRota;
  alertas: ConfigAlertas;
  consultores: EntradaConsultor[];
}

export interface ResultadoConsultor {
  consultor: EntradaConsultor;
  goal: GoalView;
  alerts: Alerta[];
}

const ORDEM_CODIGO: Record<CodigoAlerta, number> = { nao_iniciou: 0, sem_registro: 1, visita_aberta: 2, ritmo_atrasado: 3, parada_vencida: 4 };
const PESO_SEVERIDADE: Record<SeveridadeAlerta, number> = { alta: 0, media: 1 };

/** Ordem de exibição: severidade, nome do consultor, código. */
export const ordenarAlertas = (a: Alerta, b: Alerta): number =>
  PESO_SEVERIDADE[a.severity] - PESO_SEVERIDADE[b.severity] ||
  a.consultant_name.localeCompare(b.consultant_name, 'pt-BR') ||
  ORDEM_CODIGO[a.code] - ORDEM_CODIGO[b.code] ||
  (a.consultant_id < b.consultant_id ? -1 : a.consultant_id > b.consultant_id ? 1 : 0);

function alertasDe(c: EntradaConsultor, e: EntradaAlertas, goal: GoalView): Alerta[] {
  const p = paramsDaConfig(e.config);
  const lim = e.alertas;
  const base = { consultant_id: c.id, consultant_name: c.name, praca_id: c.praca_id, praca_name: c.praca_name, phone: c.phone };
  const dentroDaJanela = e.agoraMin >= p.janelaIni && e.agoraMin < p.janelaFim;
  const out: Alerta[] = [];

  if (!c.active || !goal.dia_de_trabalho || c.situacao === 'encerrou') return out;

  if (c.situacao === 'nao_iniciou') {
    const limite = p.janelaIni + lim.alerta_inicio_apos_min;
    if (e.agoraMin >= limite && e.agoraMin < p.janelaFim) {
      out.push({
        ...base,
        code: 'nao_iniciou',
        severity: 'alta',
        message: `${c.name} — não iniciou a jornada (começa às ${minParaHhmm(p.janelaIni)}; agora ${minParaHhmm(e.agoraMin)}).`,
        conta: `Janela começa às ${minParaHhmm(p.janelaIni)} + ${lim.alerta_inicio_apos_min} min de tolerância = ${minParaHhmm(limite)}. Agora são ${minParaHhmm(e.agoraMin)} e não há jornada hoje.`,
        since: null,
      });
    }
    return out;
  }

  // em_jornada daqui para baixo
  const aberta = c.visitaAberta;
  if (aberta) {
    const min = minutosEntre(aberta.checkin_at, e.agora);
    if (min > lim.alerta_visita_aberta_min) {
      out.push({
        ...base,
        code: 'visita_aberta',
        severity: 'media',
        message: `${c.name} — visita aberta há ${duracao(min)} (${aberta.nome}).`,
        conta: `Agora ${minParaHhmm(e.agoraMin)} − check-in ${horaDe(aberta.checkin_at)} = ${min} min; o limite é ${lim.alerta_visita_aberta_min} min.`,
        since: aberta.checkin_at.toISOString(),
      });
    }
  }

  // Com visita aberta o aviso é o da visita (a pessoa está dentro do estabelecimento).
  if (c.ultimoRegistro && !aberta) {
    const min = minutosEntre(c.ultimoRegistro, e.agora);
    if (min > lim.alerta_sem_registro_min) {
      out.push({
        ...base,
        code: 'sem_registro',
        severity: 'alta',
        message: `${c.name} — sem registro há ${duracao(min)} (pode ser tela apagada).`,
        conta: `Agora ${minParaHhmm(e.agoraMin)} − último registro ${horaDe(c.ultimoRegistro)} = ${min} min; o limite é ${lim.alerta_sem_registro_min} min. O ponto só é gravado com a tela aberta.`,
        since: c.ultimoRegistro.toISOString(),
      });
    }
  }

  if (dentroDaJanela && goal.delta <= -lim.alerta_ritmo_atras) {
    out.push({
      ...base,
      code: 'ritmo_atrasado',
      severity: 'media',
      message: `${c.name} — ${goal.feitas} de ${goal.esperadas} esperadas até ${minParaHhmm(e.agoraMin)} (ritmo ${-goal.delta} atrás).`,
      conta: `${goal.conta} Atraso ${-goal.delta} = ${goal.esperadas} esperadas − ${goal.feitas} feitas; o limite é ${lim.alerta_ritmo_atras}.`,
      since: null,
    });
  }

  if (c.paradasPendentes && e.agoraMin <= p.janelaFim) {
    const vencidas = c.paradasPendentes
      .filter((s) => s.eta_min + lim.alerta_parada_vencida_min < e.agoraMin)
      .sort((a, b) => a.eta_min - b.eta_min || a.nome.localeCompare(b.nome, 'pt-BR'));
    const primeira = vencidas[0];
    if (primeira) {
      out.push({
        ...base,
        code: 'parada_vencida',
        severity: 'media',
        message: `${c.name} — ${vencidas.length === 1 ? '1 parada do roteiro passou' : `${vencidas.length} paradas do roteiro passaram`} do horário previsto (a primeira: ${primeira.nome}, previsto ${minParaHhmm(primeira.eta_min)}).`,
        conta: `Agora ${minParaHhmm(e.agoraMin)} − horário previsto ${minParaHhmm(primeira.eta_min)} = ${e.agoraMin - primeira.eta_min} min; o limite é ${lim.alerta_parada_vencida_min} min.`,
        since: null,
      });
    }
  }
  return out;
}

/** Meta e alertas de cada consultor. Consultor inativo sai da conta. */
export function calcularAlertas(e: EntradaAlertas): ResultadoConsultor[] {
  const dia = ehDiaDeTrabalho(e.diaSemana, e.alertas);
  return e.consultores
    .filter((c) => c.active)
    .map((c) => {
      const goal = metaDoDia({ agoraMin: e.agoraMin, feitas: c.feitas, config: e.config, diaDeTrabalho: dia });
      return { consultor: c, goal, alerts: alertasDe(c, e, goal).sort(ordenarAlertas) };
    });
}
