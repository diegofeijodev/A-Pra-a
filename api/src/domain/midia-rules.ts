// Regras puras de mídia — porta literal de `.prototype/src/lib/praca/campanhas.ts`
// (`campanhaName` 52-62, `gatesOk` 70-77, `fillHours` 82-89, `campMetrics` 106-133).
// Nenhuma delas toca o banco: quem consulta é o `MidiaService`, que passa as
// linhas já lidas. Chaves de saída em snake_case porque a view vai direto no wire.
import { dateFromString } from '../common/time/dates';
import { MESES, OBJETIVOS } from './catalog/midia';
import { STEPS } from './catalog/steps';

/** Praça vista pelo nome da campanha: a cidade manda, o nome é o reserva. */
export interface NamedPraca {
  name?: string;
  city?: string;
}

/**
 * `BH-Contratante-Cadastro-Set26` — o mesmo nome usado no Meta e no Google.
 *
 * A sigla vem das iniciais das palavras da cidade com mais de 2 letras
 * ("Belo Horizonte · MG" → BH, porque "·" e "MG" caem no filtro); cidade de uma
 * palavra só vira as 3 primeiras letras. O sufixo "+ Contagem" do nome da praça
 * é cortado antes — o nome da campanha fala da praça, não da vizinha.
 */
export function campanhaName(
  praca: NamedPraca | undefined | null,
  publico: string,
  objetivo: string,
  start: string,
): string {
  const city = praca?.city ?? praca?.name ?? 'Praça';
  const words = city
    .replace(/\s*\+.*/, '')
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 2);
  const sigla =
    words.length > 1 ? words.map((w) => w[0]!.toUpperCase()).join('') : city.slice(0, 3).toUpperCase();
  // Meio-dia UTC (`dateFromString`) e não hora local: dia 1º do mês não pode
  // escorregar para o mês anterior por causa de fuso.
  const d = dateFromString(start);
  const mes = `${MESES[d.getUTCMonth()]}${String(d.getUTCFullYear()).slice(2)}`;
  const pub = publico === 'freelancer' ? 'Freelancer' : 'Contratante';
  const obj = OBJETIVOS.find((o) => o.id === objetivo)?.short ?? 'Marca';
  return `${sigla}-${pub}-${obj}-${mes}`;
}

// ── portões do playbook (freio de mídia) ──────────────────────
/** Linha de `praca_step_states` — o que o portão precisa ver. */
export interface StepStateRow {
  step_n: number;
  actual: number | null;
  unlocked_at: Date | string | null;
}

export interface GateView {
  ok: boolean;
  falta: string[];
}

/** Etapas com portão que travam a mídia e a etapa seguinte que as libera na mão. */
const GATES: { step: number; next: number }[] = [
  { step: 2, next: 3 },
  { step: 6, next: 7 },
];

/** As 4 etapas que o portão lê — o `where` de `praca_step_states` sai daqui. */
export const GATE_STEP_NS: number[] = GATES.flatMap((g) => [g.step, g.next]);

/**
 * Portões das etapas 2 (40 garçons) e 6 (5 clientes com segunda vaga).
 *
 * A praça entra só pelas linhas de `praca_step_states`: `actual` da etapa do
 * portão e `unlocked_at` da etapa seguinte (o `steps[3]?.unlock` do protótipo —
 * liberar a etapa 3 na mão dispensa o número da 2).
 */
export function gatesOk(steps: StepStateRow[]): GateView {
  const falta: string[] = [];
  for (const g of GATES) {
    const gate = STEPS.find((s) => s.n === g.step)?.gate;
    if (!gate) continue;
    const atual = steps.find((s) => s.step_n === g.step)?.actual ?? 0;
    const liberada = steps.find((s) => s.step_n === g.next)?.unlocked_at != null;
    if (atual < gate.target && !liberada) falta.push(`Etapa ${g.step} — ${gate.label} (hoje: ${atual})`);
  }
  return { ok: falta.length === 0, falta };
}

// ── tempo de preenchimento (freio automático) ─────────────────
/** Vaga do lead vista pelo freio: só a preenchida que anotou a hora conta. */
export interface FillVaga {
  filled: boolean;
  hours: number | null;
}

/** Média de horas para preencher a vaga. `null` quando ninguém anotou hora. */
export function fillHours(vagas: FillVaga[]): number | null {
  const hs = vagas.filter((v) => v.filled && v.hours != null).map((v) => v.hours!);
  if (!hs.length) return null;
  return hs.reduce((a, b) => a + b, 0) / hs.length;
}

// ── números da campanha ───────────────────────────────────────
export interface CampMetrics {
  investido: number;
  alcance: number;
  cliques: number;
  conversoes: number;
  /** Custo por conversão (o protótipo chama de `cpc`). */
  cpc: number;
  leads: number;
  cadastros: number;
  ativos: number;
  cp_cadastro: number;
  cp_ativo: number;
  acima_teto: boolean;
}

export interface MetricCampanha {
  id: string;
  gasto: number;
  cac_teto: number;
}

export interface TrafficEntryRow {
  id: string;
  campanha_id: string;
}

export interface TrafficDayRow {
  entry_id: string;
  investido: number;
  alcance: number;
  cliques: number;
  conversoes: number;
}

export interface CampLeadRow {
  campanha_id: string | null;
  stage: number;
}

/** Etapa a partir da qual o lead conta como cadastro feito. */
const STAGE_CADASTRO = 5;
/** Etapa do cliente ativo (rodou vaga e voltou). */
const STAGE_ATIVO = 7;

/**
 * Os números da campanha. `investido` é a soma dos dias lançados e só cai no
 * `gasto` declarado quando nenhum dia foi lançado (`|| c.gasto` do protótipo);
 * `acima_teto` exige ativo > 0 — sem ativo, dividir por zero não é alerta.
 */
export function campMetrics(
  c: MetricCampanha,
  traffic: TrafficEntryRow[],
  trafficDays: TrafficDayRow[],
  leads: CampLeadRow[],
): CampMetrics {
  const entries = traffic.filter((t) => t.campanha_id === c.id).map((t) => t.id);
  const days = trafficDays.filter((d) => entries.includes(d.entry_id));
  const investido = days.reduce((a, d) => a + d.investido, 0) || c.gasto;
  const doFunil = leads.filter((l) => l.campanha_id === c.id);
  const cadastros = doFunil.filter((l) => l.stage >= STAGE_CADASTRO).length;
  const ativos = doFunil.filter((l) => l.stage === STAGE_ATIVO).length;
  const conversoes = days.reduce((a, d) => a + d.conversoes, 0);
  const cp_ativo = ativos ? investido / ativos : 0;
  return {
    investido,
    alcance: days.reduce((a, d) => a + d.alcance, 0),
    cliques: days.reduce((a, d) => a + d.cliques, 0),
    conversoes,
    cpc: conversoes ? investido / conversoes : 0,
    leads: doFunil.length,
    cadastros,
    ativos,
    cp_cadastro: cadastros ? investido / cadastros : 0,
    cp_ativo,
    acima_teto: cp_ativo > c.cac_teto && ativos > 0,
  };
}
