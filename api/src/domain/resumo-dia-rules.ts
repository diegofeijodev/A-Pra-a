/**
 * Resumo e nota do dia (contrato §33.5) — PURO. Origem: Lovable `src/lib/visita.ts` (`resumoRota`):
 * `nota = arred1(cumprimento × 7 + mín(1, positivação ÷ 0,3) × 3)`, com pesos e alvo configuráveis (§33.2).
 *
 * A nota é calculada em INTEIROS (frações exatas, meio para cima): ponto flutuante daria 30,000000000000004. As duas
 * parcelas são escritas com 2 casas de modo que a soma escrita, arredondada, dá a nota (critério J3 da UX).
 */
import { minutesSp } from '../common/time/dates';
import { FRASES_RESUMO_DIA } from './catalog/resumo-dia';
import { textoFonteCadastros, type FontePeriodo } from './cadastros-dia-rules';
import { grupoConfig, inteiroEntre, umDe } from './config-grupo';
import { minParaHhmm } from './rota-rules';

export const UI_RESUMO_DIA = ['nota', 'numeros', 'desligado'] as const;
export type UiResumoDia = (typeof UI_RESUMO_DIA)[number];

export interface ConfigResumoDia {
  ui_resumo_dia: UiResumoDia;
  nota_peso_rota: number;
  nota_peso_conversao: number;
  nota_meta_conversao_pct: number;
  nota_intervalo_alerta_min: number;
}

export const CONFIG_RESUMO_DIA = grupoConfig<ConfigResumoDia>(
  { ui_resumo_dia: 'nota', nota_peso_rota: 7, nota_peso_conversao: 3, nota_meta_conversao_pct: 30, nota_intervalo_alerta_min: 75 },
  {
    ui_resumo_dia: umDe(UI_RESUMO_DIA),
    nota_peso_rota: inteiroEntre(0, 10),
    nota_peso_conversao: inteiroEntre(0, 10),
    nota_meta_conversao_pct: inteiroEntre(1, 100),
    nota_intervalo_alerta_min: inteiroEntre(15, 480),
  },
  {
    erro: (c) =>
      c.nota_peso_rota + c.nota_peso_conversao === 10
        ? null
        : `nota_peso_rota: os pesos da nota precisam somar 10 (${c.nota_peso_rota} + ${c.nota_peso_conversao} = ${c.nota_peso_rota + c.nota_peso_conversao}).`,
    corrigir: (c) => ({ ...c, nota_peso_rota: 7, nota_peso_conversao: 3 }),
  },
);

// ── a nota, em inteiros ────────────────────────────────────

interface Fracao {
  n: number;
  d: number;
}
const soma = (a: Fracao, b: Fracao): Fracao => ({ n: a.n * b.d + b.n * a.d, d: a.d * b.d });
/** `floor(x × k)` exato para a fração. */
const pisoVezes = (f: Fracao, k: number): number => Math.floor((f.n * k) / f.d);
/** `round(x × k)` com meio para cima, exato. */
const arredVezes = (f: Fracao, k: number): number => Math.floor((2 * f.n * k + f.d) / (2 * f.d));

export interface EntradaNota {
  /** Denominador do cumprimento: paradas planejadas (ou a meta do dia, sem roteiro). */
  planejadas: number;
  /** Numerador do cumprimento (teto em `planejadas`). */
  feitas: number;
  /** Denominador da positivação: visitas concluídas do dia. */
  visitas: number;
  cadastros: number;
  peso_rota: number;
  peso_conversao: number;
  meta_pct: number;
}

export interface Nota {
  /** Nota × 10 (inteiro): 81 = 8,1. */
  nota10: number;
  /** Parcelas × 100 (inteiros), escritas de modo que `rota100 + conversao100` arredondada dê a nota. */
  rota100: number;
  conversao100: number;
  soma100: number;
}

export function calcularNota(e: EntradaNota): Nota {
  const rota: Fracao = e.planejadas > 0 ? { n: e.peso_rota * Math.min(e.feitas, e.planejadas), d: e.planejadas } : { n: 0, d: 1 };
  const alvo = e.visitas * e.meta_pct;
  const conversao: Fracao = e.visitas > 0 ? { n: e.peso_conversao * Math.min(100 * e.cadastros, alvo), d: alvo } : { n: 0, d: 1 };
  const total = soma(rota, conversao);
  // A soma escrita é TRUNCADA em 2 casas: o arredondamento de 1 casa (meio para cima) do truncado é o mesmo do exato.
  const soma100 = pisoVezes(total, 100);
  const rota100 = pisoVezes(rota, 100);
  return { nota10: arredVezes(total, 10), rota100, conversao100: soma100 - rota100, soma100 };
}

// ── formatação ─────────────────────────────────────────────

/** 560 → "5,60" */
export const centesimos = (h: number): string => `${Math.floor(h / 100)},${String(h % 100).padStart(2, '0')}`;
/** 81 → "8,1" */
export const decimos = (d: number): string => `${Math.floor(d / 10)},${d % 10}`;
const pct = (num: number, den: number): number => (den > 0 ? Math.round((100 * num) / den) : 0);
/** 520 → "8h40" */
export const duracaoTexto = (min: number): string => (min >= 60 ? `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}` : `${min} min`);
const plural = (n: number, um: string, varios: string): string => `${n} ${n === 1 ? um : varios}`;

// ── o resumo ───────────────────────────────────────────────

export interface EntradaResumoDia {
  agora: Date;
  /** O dia é hoje e a jornada ainda está aberta (ou nem começou): a conta é "até agora". */
  diaAberto: boolean;
  jornadas: { started_at: Date; ended_at: Date | null }[];
  /** Minutos de intervalo registrados; `null` = sem registro de intervalo neste servidor (fase L4). */
  intervaloMin: number | null;
  /** Roteiro ativo do dia: `null` = sem roteiro (ou roteiro desligado). */
  rota: { planejadas: number; visitadas: number } | null;
  meta: number;
  visitasConcluidas: number;
  /** Minutos de cada visita concluída (chegada → conclusão). */
  duracoesMin: number[];
  cadastros: number;
  fonte: FontePeriodo;
  syncLigado: boolean;
  cuponsLigados: boolean;
  cfg: ConfigResumoDia;
}

export interface ResumoDia {
  display: UiResumoDia;
  day_open: boolean;
  planned: number;
  planned_source: 'roteiro' | 'meta';
  route_visited: number | null;
  visits_done: number;
  signups: number;
  signups_source: FontePeriodo;
  signup_sync_enabled: boolean;
  cumprimento_pct: number;
  positivacao_pct: number | null;
  nota: number | null;
  partes: { rota: number; conversao: number } | null;
  total_min: number;
  first_start: string | null;
  last_end: string | null;
  intervalo_min: number | null;
  avg_visit_min: number | null;
  avaliacao: string[];
  conta: string[];
}

export function resumoDia(e: EntradaResumoDia): ResumoDia {
  const comRota = !!e.rota && e.rota.planejadas > 0;
  const planejadas = comRota ? e.rota!.planejadas : e.meta;
  const feitas = comRota ? e.rota!.visitadas : e.visitasConcluidas;
  const V = e.visitasConcluidas;
  const C = e.cadastros;
  const cfg = e.cfg;
  const n = calcularNota({ planejadas, feitas, visitas: V, cadastros: C, peso_rota: cfg.nota_peso_rota, peso_conversao: cfg.nota_peso_conversao, meta_pct: cfg.nota_meta_conversao_pct });
  const comNota = cfg.ui_resumo_dia === 'nota';
  const cumprimento = pct(Math.min(feitas, planejadas), planejadas);
  const positivacao = V > 0 ? pct(C, V) : null;
  const semMedida = e.fonte === 'freela_confirmed' && !e.syncLigado;

  // tempos
  const fim = (j: { started_at: Date; ended_at: Date | null }) => (j.ended_at ?? (e.diaAberto ? e.agora : j.started_at)).getTime();
  const total = e.jornadas.reduce((a, j) => a + Math.max(0, Math.round((fim(j) - j.started_at.getTime()) / 60_000)), 0);
  const inicios = e.jornadas.map((j) => j.started_at.getTime());
  const abertas = e.jornadas.some((j) => j.ended_at === null);
  const fins = e.jornadas.filter((j) => j.ended_at).map((j) => j.ended_at!.getTime());
  const primeiro = inicios.length ? minParaHhmm(minutesSp(new Date(Math.min(...inicios)))) : null;
  const ultimo = !abertas && fins.length ? minParaHhmm(minutesSp(new Date(Math.max(...fins)))) : null;
  const media = e.duracoesMin.length ? Math.round(e.duracoesMin.reduce((a, x) => a + x, 0) / e.duracoesMin.length) : null;

  // avaliação (Lovable, mesma ordem)
  const fracCumprimento = planejadas > 0 ? Math.min(feitas, planejadas) / planejadas : 0;
  const avaliacao: string[] = [];
  if (fracCumprimento >= 0.9) avaliacao.push(FRASES_RESUMO_DIA.rotaExcelente);
  else if (fracCumprimento >= 0.6) avaliacao.push(FRASES_RESUMO_DIA.rotaBoa(cumprimento));
  else avaliacao.push(FRASES_RESUMO_DIA.rotaBaixa);
  // Sem medida dos cadastros (confirmados com a sincronização desligada) a frase de conversão enganaria: fica de fora.
  if (!semMedida) {
    if (V > 0 && 100 * C >= V * cfg.nota_meta_conversao_pct) avaliacao.push(FRASES_RESUMO_DIA.conversaoOtima);
    else if (V > 0) avaliacao.push(e.cuponsLigados ? FRASES_RESUMO_DIA.conversaoComCupom : FRASES_RESUMO_DIA.conversaoSemCupom);
  }
  if (e.intervaloMin != null && e.intervaloMin > cfg.nota_intervalo_alerta_min) avaliacao.push(FRASES_RESUMO_DIA.intervaloLongo(cfg.nota_intervalo_alerta_min));
  avaliacao.push(n.nota10 >= 80 ? FRASES_RESUMO_DIA.diaProdutivo : FRASES_RESUMO_DIA.obrigado);

  // a conta, por escrito
  const conta: string[] = [];
  const baseRota = comRota
    ? `${feitas} de ${plural(planejadas, 'parada planejada', 'paradas planejadas')} do roteiro (${cumprimento}%)`
    : `${feitas} de ${plural(planejadas, 'visita', 'visitas')} da meta do dia, sem roteiro hoje (${cumprimento}%)`;
  const teto = feitas > planejadas ? '; o que passou da rota não conta (teto de 100%)' : '';
  const baseConv = V > 0 ? `${C} de ${plural(V, 'visita concluída', 'visitas concluídas')} (${positivacao}%)` : 'nenhuma visita concluída';
  if (comNota) {
    conta.push(`Nota de 0 a 10 = rota × ${cfg.nota_peso_rota} + cadastros × ${cfg.nota_peso_conversao} (pesos da configuração).`);
    conta.push(`Rota: ${baseRota}${teto} × ${cfg.nota_peso_rota} = ${centesimos(n.rota100)}.`);
    conta.push(
      V > 0
        ? `Cadastros: ${baseConv}; ${cfg.nota_meta_conversao_pct}% já vale a parte cheia → mín(1; ${positivacao}% ÷ ${cfg.nota_meta_conversao_pct}%) × ${cfg.nota_peso_conversao} = ${centesimos(n.conversao100)}.`
        : `Cadastros: nenhuma visita concluída → ${centesimos(n.conversao100)}.`,
    );
    conta.push(`Soma: ${centesimos(n.rota100)} + ${centesimos(n.conversao100)} = ${centesimos(n.soma100)} → nota ${decimos(n.nota10)} (arredondada para 1 casa).`);
  } else {
    conta.push(`Rota: ${baseRota}${teto}.`);
    conta.push(`Cadastros: ${baseConv}.`);
  }
  conta.push(
    e.fonte === 'freela_confirmed'
      ? 'Cadastros = os confirmados pelo Freela com data neste dia (regra de remuneração vigente: cadastro confirmado); um confirmado de hoje pode ser de visita de outro dia.'
      : textoFonteCadastros(e.fonte, e.syncLigado),
  );
  if (semMedida) {
    conta.push(
      comNota
        ? `A sincronização com o Freela está desligada neste servidor: os cadastros confirmados ficam em 0, a positivação é 0 e a nota máxima é ${cfg.nota_peso_rota}.`
        : 'A sincronização com o Freela está desligada neste servidor: os cadastros confirmados ficam em 0 e a positivação é 0.',
    );
  }
  conta.push(`Visitas concluídas = as visitas do dia com a conclusão feita que contam na meta.`);
  conta.push(`Tempo do dia = soma das jornadas, do início ao fim${abertas ? ' (a aberta conta até agora)' : ''}${e.intervaloMin == null ? '; intervalo ainda não é registrado neste servidor' : ''}.`);
  if (e.diaAberto) conta.push('Dia ainda aberto: a conta é até agora.');
  conta.push(`Calculado às ${minParaHhmm(minutesSp(e.agora))}. Uma confirmação que chegar depois muda a conta.`);

  return {
    display: cfg.ui_resumo_dia,
    day_open: e.diaAberto,
    planned: planejadas,
    planned_source: comRota ? 'roteiro' : 'meta',
    route_visited: comRota ? e.rota!.visitadas : null,
    visits_done: V,
    signups: C,
    signups_source: e.fonte,
    signup_sync_enabled: e.syncLigado,
    cumprimento_pct: cumprimento,
    positivacao_pct: positivacao,
    nota: comNota ? n.nota10 / 10 : null,
    partes: comNota ? { rota: n.rota100 / 100, conversao: n.conversao100 / 100 } : null,
    total_min: total,
    first_start: primeiro,
    last_end: ultimo,
    intervalo_min: e.intervaloMin,
    avg_visit_min: media,
    avaliacao,
    conta,
  };
}
