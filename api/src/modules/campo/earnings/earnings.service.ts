/**
 * Remuneração do consultor (F8, contrato §28). Orquestra o cálculo puro (`domain/earnings-rules`), o razão
 * append-only e o fechamento semanal. UMA conta serve a leitura e o fechamento:
 * `alvo (função pura) − já lançado (só accrual) = delta`; a leitura soma o razão e os deltas ainda não lançados.
 */
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuthUser } from '../../../common/auth/auth-user';
import { CampoConsultant } from '../../../common/auth/campo-consultant';
import { isUuid } from '../../../common/ids/uuid';
import { addDays, eachDay, minutesSp, todaySp, weekdaySp } from '../../../common/time/dates';
import {
  alvosDaSemana,
  brl,
  calcularDia,
  calcularMes,
  calcularSemana,
  dataBR,
  dentroDoPrazoTardio,
  diaMes,
  fraseDoMes,
  inicioDaSemana,
  mesDoDia,
  mesQueTerminaNaSemana,
  nomeDoMes,
  rotuloDia,
  CHAVES_NOVAS_PADRAO,
  LIMITES_REGRA,
  LIMITES_REGRA_NOVOS,
  normalizarRegra,
  PRESET_CHEFE,
  PRESET_COMPLETO,
  planejarLancamentos,
  plural,
  proximoPagamento,
  REGRA_PADRAO,
  semanaDePagamento,
  semanaEncerrada,
  ultimoDiaDoMes,
  validarRegra,
  validarVigencia,
  versaoVigente,
  VIGENCIA_INICIAL,
  type DeltaLancamento,
  type EntradaDia,
  type JaLancado,
  type RegraBruta,
  type ResultadoDia,
  type ResultadoMes,
  type ResultadoSemana,
} from '../../../domain/earnings-rules';
import { rotuloRegraAplicada, validarRegraDoConsultor, versoesDoConsultor, type EscopoRegra } from '../../../domain/regra-consultor-rules';
import type { RegraConfirmacao } from '../../../domain/signup-sync-rules';
import { RotasConfigService } from '../../rotas/rotas-config.service';
import type { AjusteDto, ConfigRemuneracaoDto, EstornoDto, RegraConsultorDto, SimularDto } from './dto/earnings.dto';
import { EARNINGS_INPUTS, type ConsultorBasico, type DiaBruto, type EarningsInputs, type InsumosExtras } from './earnings-inputs';
import {
  EARNINGS_REPOSITORY,
  type EarningsRepository,
  type EarningsTx,
  type LancamentoNovo,
  type LancamentoRow,
  type PeriodoRow,
  type VersaoRegistrada,
} from './earnings.repository';
import { EARNINGS_OPCOES, type OpcoesEarnings } from './earnings.tokens';

export const FONTE_EARNINGS = 'Cadastros confirmados pelo Freela (sincronizado) × regra de remuneração';
/** Quando a regra do dia paga o cadastro DECLARADO (contrato §32.5) a fonte é outra, e a tela precisa dizer. */
export const FONTE_EARNINGS_DECLARADO = 'Cadastros declarados no checkout da visita × regra de remuneração';
const fonteDe = (r: RegraBruta): string => (r.signup_source === 'declared' ? FONTE_EARNINGS_DECLARADO : FONTE_EARNINGS);
const fonteDeclarada = (r: RegraBruta): { signup_source: 'declared' } | Record<string, never> =>
  r.signup_source === 'declared' ? { signup_source: 'declared' } : {};
const MAX_SEMANAS_AUTOCLOSE = 8;
const LIMITE_LANCAMENTOS = 200;
const SEMANAS_ANTERIORES = 4;

const CHAVES_VAZIAS = PRESET_COMPLETO as RegraBruta;

const notFoundConsultor = () =>
  new NotFoundException({ code: 'NOT_FOUND', message: 'Consultor não encontrado.' });

interface Ctx {
  versoes: VersaoRegistrada[];
  hoje: string;
  regraConfirmacao: RegraConfirmacao;
  vigente: VersaoRegistrada;
  weekStart: number;
  semanaAtual: string;
  /**
   * L13 (§45.2): regras próprias dos consultores já lidos nesta operação. Vazio com a flag desligada (nenhuma consulta):
   * aí todo consultor usa `versoes` (a geral) e o cálculo é o de sempre.
   */
  proprias: Map<string, VersaoRegistrada[]>;
}

/** A regra que valeu num dia para um consultor (contrato §45.4). */
export interface RegraAplicada {
  scope: EscopoRegra;
  version: number;
  valid_from: string;
  label: string;
  config_effective: ReturnType<typeof normalizarRegra>;
}

export interface Visao {
  consultor: ConsultorBasico;
  week: { from: string; to: string };
  status: 'open' | 'closed';
  periodo: PeriodoRow | null;
  calculo: ResultadoSemana;
  total_cents: number;
  /** Ajustes, estornos e confirmações tardias que entram nesta semana (fora da conta dos dias). */
  extras_cents: number;
  posted: LancamentoRow[];
  planned: DeltaLancamento[];
}

export interface SimulacaoView {
  day: { total_cents: number; conta: string[]; rule_version: number | null };
  week?: {
    total_cents: number;
    days_cents: number;
    week_part_cents: number;
    days: Array<{ day: string; total_cents: number; conta: string[] }>;
    conta: string[];
    rule_version: number | null;
  };
  /** L11 §43.5: a parte do mês, só com regra mensal e `month_signups`. */
  month?: { total_cents: number; conta: string[] };
  /** L13 §45.5: só quando simulou pela regra de um consultor. */
  rule?: RegraAplicada;
}

export interface Ator {
  id: string | null;
  name: string;
}

export const lancamentoView = (l: LancamentoRow) => ({
  id: l.id,
  kind: l.kind,
  amount_cents: l.amount_cents,
  work_scope: l.work_scope,
  work_day: l.work_day,
  work_week: l.work_week,
  payout_week: l.payout_week,
  rule_version: l.rule_version,
  source: l.source,
  reason: l.reason,
  reverses_id: l.reverses_id,
  created_by: l.created_by_name,
  created_at: l.created_at.toISOString(),
});

export const versaoView = (v: VersaoRegistrada) => ({
  version: v.version,
  valid_from: v.valid_from,
  reason: v.reason,
  created_by: v.created_by_name,
  created_at: v.created_at.toISOString(),
  /** Item 15 (contrato §28.5): a versão 1 da migração ("vale desde o começo"); `valid_from` continua a sentinela. */
  is_initial: v.valid_from === VIGENCIA_INICIAL,
  installed_at: v.created_at.toISOString(),
  /** Como foi gravada (13 chaves + as novas que existirem). */
  config: v.config,
  /** A regra completa (chaves ausentes preenchidas com o padrão = comportamento atual). */
  config_effective: normalizarRegra(v.config),
  /** L13 §45.4: só nas regras próprias de consultor. */
  ...(v.consultant_id ? { consultant_id: v.consultant_id } : {}),
});

@Injectable()
export class EarningsService {
  private readonly log = new Logger(EarningsService.name);

  constructor(
    @Inject(EARNINGS_REPOSITORY) private readonly repo: EarningsRepository,
    @Inject(EARNINGS_INPUTS) private readonly inputs: EarningsInputs,
    private readonly config: RotasConfigService,
    @Inject(EARNINGS_OPCOES) private readonly opcoes: OpcoesEarnings,
  ) {}

  // ── contexto e cálculo ──────────────────────────────────────────────────

  private async contexto(agora: Date): Promise<Ctx> {
    const [versoes, cad] = await Promise.all([this.repo.versoes(), this.config.cadastro()]);
    const hoje = todaySp(agora);
    const vigente = versaoVigente(versoes, hoje);
    if (!vigente) throw new Error('Nenhuma versão da regra de remuneração vigora hoje.');
    const weekStart = vigente.config.week_start_weekday;
    return {
      versoes,
      hoje,
      regraConfirmacao: cad.confirmation_rule,
      vigente,
      weekStart,
      semanaAtual: inicioDaSemana(hoje, weekStart),
      proprias: new Map(),
    };
  }

  // ── L13: regra por consultor (§45.2) ────────────────────────────────────

  /** Lê as regras próprias dos consultores ainda não lidos. Flag desligada: nada (nenhuma consulta). */
  private async carregarProprias(ctx: Ctx, ids: string[]): Promise<void> {
    if (!this.opcoes.porConsultorLigado) return;
    const faltam = ids.filter((id) => !ctx.proprias.has(id));
    if (!faltam.length) return;
    const lidas = await this.repo.versoesDosConsultores(faltam);
    for (const id of faltam) ctx.proprias.set(id, lidas.get(id) ?? []);
  }

  /** Versões que valem para o consultor: as dele a partir da 1ª, a geral antes. Sem regra própria = a MESMA lista geral. */
  private versoesDe(ctx: Ctx, consultantId: string): readonly VersaoRegistrada[] {
    return versoesDoConsultor(ctx.versoes, ctx.proprias.get(consultantId) ?? []);
  }

  private temPropria(ctx: Ctx, consultantId: string): boolean {
    return (ctx.proprias.get(consultantId)?.length ?? 0) > 0;
  }

  private regraAplicada(ctx: Ctx, c: ConsultorBasico, dia: string): RegraAplicada {
    const v = versaoVigente(this.versoesDe(ctx, c.id), dia) ?? ctx.vigente;
    const scope: EscopoRegra = v.consultant_id ? 'consultant' : 'global';
    return { scope, version: v.version, valid_from: v.valid_from, label: rotuloRegraAplicada(scope, v.version, c.name), config_effective: normalizarRegra(v.config) };
  }

  /** Todas as versões em jogo (geral + próprias lidas): é delas que sai a decisão de buscar insumos extras. */
  private todasAsVersoes(ctx: Ctx): VersaoRegistrada[] {
    return [...ctx.versoes, ...[...ctx.proprias.values()].flat()];
  }

  /**
   * Quem tem regra própria: a conta de cada dia dela começa dizendo qual regra valeu, e a da semana lista as regras da
   * semana. Vai também para o `snapshot` do razão. Quem não tem: nada muda.
   */
  private rotularProprias(ctx: Ctx, c: ConsultorBasico, s: ResultadoSemana): void {
    const own = ctx.proprias.get(c.id);
    if (!own?.length) return;
    const minhas = new Set(own.map((v) => v.version));
    const trechos: Array<{ version: number; de: string; ate: string }> = [];
    for (const d of s.days) {
      if (d.futuro || d.rule_version === null) continue;
      if (minhas.has(d.rule_version)) d.conta = [`${rotuloRegraAplicada('consultant', d.rule_version, c.name)}.`, ...d.conta];
      const ult = trechos[trechos.length - 1];
      if (ult && ult.version === d.rule_version) ult.ate = d.dia;
      else trechos.push({ version: d.rule_version, de: d.dia, ate: d.dia });
    }
    if (trechos.length)
      s.conta.unshift(
        `Regras desta semana: ${trechos
          .map((t) => `${rotuloRegraAplicada(minhas.has(t.version) ? 'consultant' : 'global', t.version, c.name)} (${t.de === t.ate ? diaMes(t.de) : `${diaMes(t.de)} a ${diaMes(t.ate)}`})`)
          .join('; ')}.`,
      );
    if (s.month?.rule_version != null && minhas.has(s.month.rule_version))
      s.month.conta.unshift(`${rotuloRegraAplicada('consultant', s.month.rule_version, c.name)}.`);
  }

  /** Semana (início) anterior à `from`, `k` vezes. */
  private semanasAtras(from: string, k: number): string[] {
    return Array.from({ length: k }, (_, i) => addDays(from, -7 * (i + 1)));
  }

  /** Quais insumos extras buscar: só se alguma versão da regra usa o recurso (sem uso, nenhuma consulta nova). */
  private extras(ctx: Ctx): InsumosExtras {
    const versoes = this.todasAsVersoes(ctx);
    return {
      declared: versoes.some((v) => v.config.signup_source === 'declared'),
      routes: versoes.some((v) => v.config.daily_base_condition === 'route_assigned' && (v.config.daily_base_cents ?? 0) > 0),
      // Lote B §37.6: só busca jornadas/intervalos de novo se alguma versão exige tempo trabalhado.
      ...(versoes.some((v) => v.config.daily_base_min_worked_minutes != null) ? { worked: true } : {}),
    };
  }

  /** L11: alguma versão em jogo é mensal? Sem nenhuma, a leitura dos insumos e o cálculo são os de sempre. */
  private algumMensal(ctx: Ctx): boolean {
    return this.todasAsVersoes(ctx).some((v) => v.config.tiers_period === 'month');
  }

  private entradasDaSemana(
    ctx: Ctx,
    c: ConsultorBasico,
    from: string,
    brutos: Map<string, DiaBruto> | undefined,
  ): Record<string, EntradaDia> {
    return this.entradasDosDias(ctx, c, Array.from({ length: 7 }, (_, i) => addDays(from, i)), brutos);
  }

  private entradasDosDias(
    ctx: Ctx,
    c: ConsultorBasico,
    dias: readonly string[],
    brutos: Map<string, DiaBruto> | undefined,
  ): Record<string, EntradaDia> {
    const versoes = this.versoesDe(ctx, c.id);
    const out: Record<string, EntradaDia> = {};
    for (const dia of dias) {
      const raw = brutos?.get(dia);
      const bruta = versaoVigente(versoes, dia)?.config;
      const regra = bruta ? normalizarRegra(bruta) : undefined;
      const visits =
        regra?.visits_count === 'checkout' ? (raw?.visits_checkout ?? 0) : (raw?.visits_checkin ?? 0);
      let signups = raw?.signups ?? 0;
      let acima = 0;
      let anuladas = 0;
      if (regra?.signup_source === 'declared') {
        // S3: quem paga é a declaração (menos as anuladas), limitada por `declared_daily_cap` da regra do dia.
        const decl = raw?.declared ?? 0;
        signups = regra.declared_daily_cap === null ? decl : Math.min(decl, regra.declared_daily_cap);
        acima = decl - signups;
        anuladas = raw?.declared_voided ?? 0;
      } else if (raw?.pareados_declarados?.length) {
        // Pagar uma vez por empresa: confirmado pareado a declaração JÁ paga sob regra `declared` não conta de novo.
        const jaPagas = raw.pareados_declarados.filter(
          (dd) => normalizarRegra(versaoVigente(versoes, dd)?.config ?? CHAVES_VAZIAS).signup_source === 'declared',
        ).length;
        signups = Math.max(0, signups - jaPagas);
      }
      out[dia] = {
        dia,
        signups,
        visits,
        journey_open: raw?.journey ?? false,
        elegivel: c.active && dia >= c.created_day,
        ...(raw?.route_equipe ? { route_assigned: true } : {}),
        ...(acima > 0 ? { declared_over_cap: acima } : {}),
        ...(anuladas > 0 ? { declared_voided: anuladas } : {}),
        ...(regra?.daily_base_min_worked_minutes != null ? { worked_minutes: raw?.worked_minutes ?? 0 } : {}),
      };
    }
    return out;
  }

  /** Cálculo puro das semanas pedidas, para vários consultores, com UMA leitura de insumos. */
  private async calcular(
    ctx: Ctx,
    consultores: ConsultorBasico[],
    semanas: string[],
  ): Promise<Map<string, Map<string, ResultadoSemana>>> {
    const out = new Map<string, Map<string, ResultadoSemana>>(consultores.map((c) => [c.id, new Map()]));
    if (!consultores.length || !semanas.length) return out;
    await this.carregarProprias(ctx, consultores.map((c) => c.id));
    const ordenadas = [...semanas].sort();
    let from = ordenadas[0] as string;
    const to = addDays(ordenadas[ordenadas.length - 1] as string, 6);
    // L11: a semana que contém o fim de um mês com regra mensal precisa dos dias do mês inteiro (só então a leitura cresce).
    const mensal = this.algumMensal(ctx);
    if (mensal)
      for (const w of semanas) {
        const m = mesQueTerminaNaSemana(w);
        if (m && `${m}-01` < from) from = `${m}-01`;
      }
    const brutos = await this.inputs.dias(
      consultores.map((c) => c.id),
      from,
      to,
      ctx.regraConfirmacao,
      this.extras(ctx),
    );
    for (const c of consultores) {
      const versoes = this.versoesDe(ctx, c.id);
      for (const w of semanas) {
        const m = mensal ? mesQueTerminaNaSemana(w) : null;
        const mes: ResultadoMes | null = m
          ? calcularMes({
              mes: m,
              hoje: ctx.hoje,
              versoes,
              entradas: this.entradasDosDias(ctx, c, eachDay(`${m}-01`, ultimoDiaDoMes(m)), brutos.get(c.id)),
              weekStart: ctx.weekStart,
            })
          : null;
        const calc = calcularSemana({
          from: w,
          to: addDays(w, 6),
          hoje: ctx.hoje,
          versoes,
          entradas: this.entradasDaSemana(ctx, c, w, brutos.get(c.id)),
          ...(mes ? { mes } : {}),
        });
        this.rotularProprias(ctx, c, calc);
        out.get(c.id)?.set(w, calc);
      }
    }
    return out;
  }

  private snapshot(
    ctx: Ctx,
    d: DeltaLancamento,
    calc: ResultadoSemana,
    extra: Record<string, unknown> = {},
  ): Record<string, unknown> {
    const versao = d.rule_version !== null ? this.todasAsVersoes(ctx).find((v) => v.version === d.rule_version) : undefined;
    const regra = versao?.config ?? ctx.vigente.config;
    const dia = d.scope === 'day' ? calc.days.find((x) => x.dia === d.work_day) : null;
    // L11: a parte do mês fotografa o mês (contagem e conta); L13: a regra própria diz que é do consultor.
    const mes = d.scope === 'month' ? calc.month : undefined;
    const proprio = versao?.consultant_id ? { rule_scope: 'consultant' } : {};
    if (mes)
      return {
        rule_version: d.rule_version,
        rule: regra,
        confirmation_rule: ctx.regraConfirmacao,
        confirmation_day_field: ctx.regraConfirmacao === 'activated' ? 'activated_day' : ctx.regraConfirmacao === 'first_vacancy' ? 'first_vacancy_day' : 'first_job_day',
        scope: d.scope,
        target_cents: d.cents,
        delta_cents: d.delta_cents,
        inputs: { month: mes.mes, signups_month: mes.signups },
        conta: mes.conta,
        ...proprio,
        ...extra,
      };
    return {
      rule_version: d.rule_version,
      rule: regra,
      confirmation_rule: ctx.regraConfirmacao,
      confirmation_day_field:
        ctx.regraConfirmacao === 'activated'
          ? 'activated_day'
          : ctx.regraConfirmacao === 'first_vacancy'
            ? 'first_vacancy_day'
            : 'first_job_day',
      scope: d.scope,
      target_cents: d.cents,
      delta_cents: d.delta_cents,
      inputs: dia
        ? { signups: dia.signups, visits: dia.visits, journey_open: dia.journey_open }
        : { signups_week: calc.signups_week },
      conta: dia ? dia.conta : calc.conta,
      ...proprio,
      ...extra,
    };
  }

  private async lancarDeltas(
    tx: EarningsTx,
    ctx: Ctx,
    consultantId: string,
    deltas: Array<{ delta: DeltaLancamento; calc: ResultadoSemana; payout: string }>,
    source: string,
    ator: Ator,
    extra: Record<string, unknown> = {},
  ): Promise<number> {
    let n = 0;
    for (const { delta, calc, payout } of deltas) {
      // Delta NEGATIVO de um dia com declaração anulada = estorno da anulação (contrato §32.5); o `kind` continua accrual.
      const diaDelta = delta.scope === 'day' ? calc.days.find((x) => x.dia === delta.work_day) : undefined;
      const anulacao = delta.delta_cents < 0 && (diaDelta?.declared_voided ?? 0) > 0;
      const novo: LancamentoNovo = {
        consultant_id: consultantId,
        kind: 'accrual',
        amount_cents: delta.delta_cents,
        work_scope: delta.scope,
        work_day: delta.work_day,
        work_week: delta.work_week,
        payout_week: payout,
        rule_version: delta.rule_version,
        source: anulacao ? 'declaration_void' : source,
        reason: null,
        reverses_id: null,
        idempotency_key: delta.idempotency_key,
        snapshot: this.snapshot(ctx, delta, calc, anulacao ? { ...extra, declaration_void: true } : extra),
        created_by: ator.id,
        created_by_name: ator.name,
      };
      const r = await tx.inserirLancamento(novo);
      if (r.criado) n++;
    }
    return n;
  }

  // ── leitura (a mesma conta do fechamento) ───────────────────────────────

  /** Quantas semanas para trás procurar semanas fechadas que ainda aceitam confirmação tardia. */
  private janelaTardia(ctx: Ctx): number {
    return Math.ceil(ctx.vigente.config.late_grace_days / 7) + 1;
  }

  /** Semanas fechadas, dentro do prazo, cujo delta tardio é pago em `semana` (a primeira aberta depois delas). */
  private tardiasPara(ctx: Ctx, semana: string, fechadas: ReadonlySet<string>): string[] {
    const grace = ctx.vigente.config.late_grace_days;
    return this.semanasAtras(semana, this.janelaTardia(ctx)).filter(
      (w) =>
        fechadas.has(w) &&
        dentroDoPrazoTardio(addDays(w, 6), ctx.hoje, grace) &&
        semanaDePagamento(w, fechadas) === semana,
    );
  }

  /** Deltas ainda não lançados que são pagos em `semana`: os dela e os tardios que caem nela. A MESMA conta lê e fecha. */
  private plano(
    semana: string,
    tardias: readonly string[],
    calcs: ReadonlyMap<string, ResultadoSemana> | undefined,
    lancado: ReadonlyMap<string, JaLancado>,
  ) {
    const out: Array<{ delta: DeltaLancamento; calc: ResultadoSemana; payout: string }> = [];
    for (const w of [semana, ...tardias]) {
      const calc = calcs?.get(w);
      if (!calc) continue;
      for (const delta of planejarLancamentos(alvosDaSemana(calc), lancado))
        out.push({ delta, calc, payout: semana });
    }
    return out;
  }

  private async fechadasDe(
    ids: string[],
    semanas: string[],
  ): Promise<{ periodos: PeriodoRow[]; porConsultor: Map<string, Set<string>> }> {
    const periodos = await this.repo.periodos(ids, semanas);
    const porConsultor = new Map<string, Set<string>>(ids.map((id) => [id, new Set()]));
    for (const p of periodos) porConsultor.get(p.consultant_id)?.add(p.week_start);
    return { periodos, porConsultor };
  }

  private async visoes(
    ctx: Ctx,
    consultores: ConsultorBasico[],
    semana: string,
  ): Promise<Map<string, Visao>> {
    const ids = consultores.map((c) => c.id);
    const [{ periodos, porConsultor: fechadasDe }, posted] = await Promise.all([
      this.fechadasDe(ids, [semana, ...this.semanasAtras(semana, this.janelaTardia(ctx))]),
      this.repo.lancamentos(ids, { payout_week: semana }),
    ]);

    // Semana aberta: calcula a própria e as fechadas cujo delta tardio cai nela.
    const tardiasDe = new Map(
      consultores.map((c) => [
        c.id,
        fechadasDe.get(c.id)?.has(semana)
          ? []
          : this.tardiasPara(ctx, semana, fechadasDe.get(c.id) ?? new Set()),
      ]),
    );
    const todasSemanas = [...new Set([semana, ...[...tardiasDe.values()].flat()])];
    const [calcs, lancado] = await Promise.all([
      this.calcular(ctx, consultores, todasSemanas),
      this.repo.lancadoAccrual(ids, todasSemanas),
    ]);

    const out = new Map<string, Visao>();
    for (const c of consultores) {
      const periodo = periodos.find((p) => p.consultant_id === c.id && p.week_start === semana) ?? null;
      const calculo = calcs.get(c.id)?.get(semana) as ResultadoSemana;
      const planned = periodo
        ? []
        : this.plano(semana, tardiasDe.get(c.id) ?? [], calcs.get(c.id), lancado.get(c.id) ?? new Map()).map(
            (x) => x.delta,
          );
      const meus = posted.filter((l) => l.consultant_id === c.id);
      const extrasPosted = meus
        .filter((l) => !(l.kind === 'accrual' && l.work_week === semana))
        .reduce((a, l) => a + l.amount_cents, 0);
      const extrasPlanned = planned
        .filter((d) => d.work_week !== semana)
        .reduce((a, d) => a + d.delta_cents, 0);
      const total = periodo
        ? periodo.total_cents
        : meus.reduce((a, l) => a + l.amount_cents, 0) + planned.reduce((a, d) => a + d.delta_cents, 0);
      out.set(c.id, {
        consultor: c,
        week: { from: semana, to: addDays(semana, 6) },
        status: periodo ? 'closed' : 'open',
        periodo,
        calculo,
        total_cents: total,
        extras_cents: extrasPosted + extrasPlanned,
        posted: meus,
        planned,
      });
    }
    return out;
  }

  private contaVisao(v: Visao): string[] {
    const conta = [...v.calculo.conta];
    if (v.extras_cents !== 0)
      conta.push(`Ajustes e confirmações tardias que entram nesta semana: ${brl(v.extras_cents)}.`);
    conta.push(
      v.periodo
        ? `Semana fechada: total a pagar ${brl(v.periodo.total_cents)} (soma do razão).`
        : `Total a pagar até agora: ${brl(v.total_cents)}${v.extras_cents !== 0 ? ` (${brl(v.total_cents - v.extras_cents)} dos dias ${v.extras_cents >= 0 ? '+' : '−'} ${brl(Math.abs(v.extras_cents))} de ajustes)` : ''}.`,
    );
    return conta;
  }

  /** O dia de uma semana pelo qual se diz "a regra desta semana": o último já calculado (hoje, se a semana é a atual). */
  private diaDeReferencia(ctx: Ctx, semana: string): string {
    const to = addDays(semana, 6);
    return ctx.hoje < semana ? semana : ctx.hoje < to ? ctx.hoje : to;
  }

  private diaDaPropria(ctx: Ctx, c: ConsultorBasico, d: ResultadoDia): boolean {
    const own = ctx.proprias.get(c.id);
    return !!own?.length && !d.futuro && own.some((v) => v.version === d.rule_version);
  }

  /** L11 §43.5: a parte do mês para a tela, com a conta e o Pix em que entra (o da semana que contém o último dia). */
  private mesView(ctx: Ctx, m: ResultadoMes) {
    const v = this.todasAsVersoes(ctx).find((x) => x.version === m.rule_version);
    const regra = normalizarRegra(v?.config ?? ctx.vigente.config);
    const pix = proximoPagamento(addDays(m.work_week, 6), ctx.vigente.config.payout_weekday);
    return {
      month: m.mes,
      label: nomeDoMes(m.mes),
      from: m.from,
      to: m.to,
      rule_version: m.rule_version,
      signups: m.signups,
      tier: m.faixa,
      amount_cents: m.month_part_cents,
      next_tier: m.proxima_faixa,
      ended: m.encerrado,
      work_week: m.work_week,
      pix_date: pix,
      pix_label: rotuloDia(pix),
      text: fraseDoMes(m, { fonte: regra.signup_source, cumulativo: regra.tiers_mode === 'cumulative', pixLabel: rotuloDia(pix) }),
      conta: m.conta,
    };
  }

  // ── equipe ──────────────────────────────────────────────────────────────

  async equipe(q: { week?: string; praca_id?: string; consultant_id?: string }, agora = new Date()) {
    const ctx = await this.contexto(agora);
    const semana = q.week ? inicioDaSemana(q.week, ctx.weekStart) : ctx.semanaAtual;
    const todos = await this.inputs.consultores({
      ...(q.praca_id ? { praca_id: q.praca_id } : {}),
      ...(q.consultant_id ? { ids: [q.consultant_id] } : {}),
    });
    if (q.consultant_id && todos.length === 0) throw notFoundConsultor();
    const consultores = todos.filter((c) => c.created_day <= addDays(semana, 6));
    const visoes = await this.visoes(ctx, consultores, semana);
    const lista = consultores.map((c) => visoes.get(c.id) as Visao);
    const ledger = q.consultant_id
      ? await this.repo.lancamentos([q.consultant_id], { payout_week: semana, limit: LIMITE_LANCAMENTOS })
      : undefined;
    return {
      week: { from: semana, to: addDays(semana, 6) },
      source: `${fonteDe(ctx.vigente.config)} (versão ${ctx.vigente.version} vigente hoje)`,
      ...fonteDeclarada(ctx.vigente.config),
      rule_version: ctx.vigente.version,
      confirmation_rule: ctx.regraConfirmacao,
      total_cents: lista.reduce((a, v) => a + v.total_cents, 0),
      consultants: lista.map((v) => ({
        consultant_id: v.consultor.id,
        name: v.consultor.name,
        praca_id: v.consultor.praca_id,
        active: v.consultor.active,
        status: v.status,
        total_cents: v.total_cents,
        confirmed_signups: v.calculo.signups_week,
        closed_at: v.periodo?.closed_at.toISOString() ?? null,
        closed_mode: v.periodo?.closed_mode ?? null,
        week_part_cents: v.calculo.week_part_cents,
        extras_cents: v.extras_cents,
        days: v.calculo.days.map((d) => ({
          day: d.dia,
          total_cents: d.total_cents,
          confirmed_signups: d.signups,
          visits: d.visits,
          journey_open: d.journey_open,
          rule_version: d.rule_version,
          future: d.futuro,
          conta: d.conta,
          ...(this.diaDaPropria(ctx, v.consultor, d) ? { rule_scope: 'consultant' as const } : {}),
        })),
        conta: this.contaVisao(v),
        ...(v.calculo.month ? { month: this.mesView(ctx, v.calculo.month), month_part_cents: v.calculo.month.month_part_cents } : {}),
        ...(this.temPropria(ctx, v.consultor.id) ? { rule: this.regraAplicada(ctx, v.consultor, this.diaDeReferencia(ctx, semana)) } : {}),
      })),
      ...(ledger ? { ledger: ledger.map(lancamentoView) } : {}),
    };
  }

  // ── consultor ───────────────────────────────────────────────────────────

  async doConsultor(c: CampoConsultant, agora = new Date()) {
    const ctx = await this.contexto(agora);
    const [basico] = await this.inputs.consultores({ ids: [c.id] });
    if (!basico) throw notFoundConsultor();
    const visao = (await this.visoes(ctx, [basico], ctx.semanaAtual)).get(c.id) as Visao;
    const hoje = visao.calculo.days.find((d) => d.dia === ctx.hoje) as ResultadoDia;
    const desde = addDays(ctx.hoje, -this.opcoes.janelaNaoConfirmadosDias);
    const nao = (await this.inputs.naoConfirmados([c.id], ctx.regraConfirmacao, desde)).get(c.id) ?? 0;

    const anteriores = [];
    for (const w of this.semanasAtras(ctx.semanaAtual, SEMANAS_ANTERIORES)) {
      if (addDays(w, 6) < basico.created_day) continue;
      const v = (await this.visoes(ctx, [basico], w)).get(c.id) as Visao;
      anteriores.push({ from: v.week.from, to: v.week.to, total_cents: v.total_cents, status: v.status });
    }
    const pixData = proximoPagamento(visao.week.to, ctx.vigente.config.payout_weekday);
    // L13 §45.5: com regra própria hoje, a versão, a fonte e o texto são os dela (sem regra própria: os de sempre).
    const propria = this.temPropria(ctx, c.id) ? this.regraAplicada(ctx, basico, ctx.hoje) : null;
    const vHoje = propria ? (versaoVigente(this.versoesDe(ctx, c.id), ctx.hoje) ?? ctx.vigente) : ctx.vigente;
    const mes = await this.projecaoDoMes(ctx, basico);
    return {
      rule_version: vHoje.version,
      confirmation_rule: ctx.regraConfirmacao,
      source: `${fonteDe(vHoje.config)} (versão ${vHoje.version})`,
      ...fonteDeclarada(vHoje.config),
      ...(propria ? { rule: propria } : {}),
      ...(mes ? { month: mes } : {}),
      as_of: agora.toISOString(),
      today: {
        day: ctx.hoje,
        total_cents: hoje.total_cents,
        confirmed_signups: hoje.signups,
        visits: hoje.visits,
        journey_open: hoje.journey_open,
        conta: hoje.conta,
      },
      week: {
        from: visao.week.from,
        to: visao.week.to,
        total_cents: visao.total_cents,
        extras_cents: visao.extras_cents,
        days: visao.calculo.days.map((d) => ({
          day: d.dia,
          total_cents: d.total_cents,
          confirmed_signups: d.signups,
        })),
        conta: this.contaVisao(visao),
      },
      unconfirmed: {
        count: nao,
        text:
          nao === 0
            ? 'Nenhum cadastro aguardando confirmação do Freela.'
            : `${plural(nao, 'cadastro ainda não confirmado', 'cadastros ainda não confirmados')} pelo Freela: não entram na conta e passam a valer no dia em que o Freela confirmar.`,
      },
      pix: {
        date: pixData,
        week_to: visao.week.to,
        text: `Pix previsto para ${dataBR(pixData)}, referente a ${diaMes(visao.week.from)} a ${diaMes(visao.week.to)}.`,
      },
      previous_weeks: anteriores,
    };
  }

  /**
   * L11 §43.5: projeção do mês corrente para o consultor ("Meta do mês (outubro): 28 de 40…"), só quando o dia 1 do mês
   * tem regra mensal para ele. Sem isso, nenhuma leitura a mais.
   */
  private async projecaoDoMes(ctx: Ctx, c: ConsultorBasico) {
    const mes = mesDoDia(ctx.hoje);
    const versoes = this.versoesDe(ctx, c.id);
    if (versaoVigente(versoes, `${mes}-01`)?.config.tiers_period !== 'month') return null;
    const brutos = await this.inputs.dias([c.id], `${mes}-01`, ctx.hoje, ctx.regraConfirmacao, this.extras(ctx));
    const m = calcularMes({
      mes,
      hoje: ctx.hoje,
      versoes,
      entradas: this.entradasDosDias(ctx, c, eachDay(`${mes}-01`, ctx.hoje), brutos.get(c.id)),
      weekStart: ctx.weekStart,
    });
    if (!m) return null;
    this.rotularMes(ctx, c, m);
    return this.mesView(ctx, m);
  }

  private rotularMes(ctx: Ctx, c: ConsultorBasico, m: ResultadoMes): void {
    if (m.rule_version != null && ctx.proprias.get(c.id)?.some((v) => v.version === m.rule_version))
      m.conta.unshift(`${rotuloRegraAplicada('consultant', m.rule_version, c.name)}.`);
  }

  // ── configuração ────────────────────────────────────────────────────────

  async lerConfig(agora = new Date()) {
    const versoes = await this.repo.versoes();
    const hoje = todaySp(agora);
    const vigente = versaoVigente(versoes, hoje);
    if (!vigente) throw new Error('Nenhuma versão da regra de remuneração vigora hoje.');
    return {
      current: versaoView(vigente),
      upcoming: versoes.filter((v) => v.valid_from > hoje).map(versaoView),
      history: [...versoes].reverse().slice(0, 50).map(versaoView),
      default_config: REGRA_PADRAO,
      limits: LIMITES_REGRA,
      // Modo do chefe (contrato §32.2): presets que só PREENCHEM o formulário; padrões e limites das chaves novas.
      presets: { completo: PRESET_COMPLETO, chefe: PRESET_CHEFE },
      extended: { defaults: CHAVES_NOVAS_PADRAO, limits: LIMITES_REGRA_NOVOS },
      features: {
        routes_enabled: this.opcoes.rotasLigadas ?? false,
        declared_signups_enabled: this.opcoes.declaradasLigado ?? false,
        // Lote B §37.6: a chave daily_base_min_worked_minutes só existe com o intervalo ligado (ausente com ele desligado).
        ...(this.opcoes.intervaloLigado ? { breaks_enabled: true } : {}),
        // Lote F1 (§43.1, §45.1): só aparecem com a flag ligada (o web nunca sonda rota desligada).
        ...(this.opcoes.mensalLigado ? { monthly_enabled: true } : {}),
        ...(this.opcoes.porConsultorLigado ? { per_consultant_enabled: true } : {}),
      },
    };
  }

  /** L11 §43.1: `tiers_period = month` com a flag desligada = 409 (antes da validação, senão sairia o 400 de sempre). */
  private recusarMesSemFlag(config: unknown): void {
    if (this.opcoes.mensalLigado) return;
    if (config && typeof config === 'object' && (config as Record<string, unknown>).tiers_period === 'month')
      throw new ConflictException({
        code: 'MONTHLY_DISABLED',
        message: 'tiers_period: o bônus mensal precisa de FIELD_EARNINGS_MONTHLY_ENABLED (e FIELD_EARNINGS_ENABLED) ligadas.',
      });
  }

  private validar(config: unknown): RegraBruta {
    this.recusarMesSemFlag(config);
    const r = validarRegra(config, { mensal: this.opcoes.mensalLigado === true });
    if (!r.ok) throw new BadRequestException({ code: 'VALIDATION_ERROR', message: r.erro });
    return r.regra;
  }

  /** Chaves que dependem de outro módulo ligado (contrato §32.1, §37.6): sem ele pagariam R$ 0 em silêncio. */
  private conferirTravas(regra: RegraBruta): void {
    if (regra.daily_base_condition === 'route_assigned' && (regra.daily_base_cents ?? 0) > 0 && !this.opcoes.rotasLigadas)
      throw new ConflictException({
        code: 'ROUTES_DISABLED',
        message:
          'daily_base_condition: a diária por rota atribuída precisa de FIELD_ROUTES_ENABLED ligada; sem rotas da equipe ela pagaria R$ 0 em silêncio.',
      });
    if (regra.signup_source === 'declared' && !this.opcoes.declaradasLigado)
      throw new ConflictException({
        code: 'DECLARED_DISABLED',
        message:
          'signup_source: o cadastro declarado precisa de FIELD_DECLARED_SIGNUPS_ENABLED (e FIELD_EARNINGS_ENABLED) ligadas.',
      });
    if (regra.daily_base_min_worked_minutes != null && !this.opcoes.intervaloLigado)
      throw new ConflictException({
        code: 'BREAKS_DISABLED',
        message:
          'daily_base_min_worked_minutes: o tempo trabalhado desconta o intervalo e precisa de FIELD_BREAKS_ENABLED ligada.',
      });
  }

  async salvarConfig(dto: ConfigRemuneracaoDto, user: AuthUser, agora = new Date()) {
    const r = { regra: this.validar(dto.config) };
    this.conferirTravas(r.regra);
    const versoes = await this.repo.versoes();
    const travada = await this.repo.existeRazaoOuFechamento();
    const erro = validarVigencia({
      valid_from: dto.valid_from,
      nova: r.regra,
      hoje: todaySp(agora),
      versoes,
      semanaTravada: travada,
    });
    if (erro) {
      const body = { code: erro.code, message: erro.message };
      throw erro.code === 'WEEK_START_LOCKED' ? new ConflictException(body) : new BadRequestException(body);
    }
    const v = await this.repo.inserirVersao({
      valid_from: dto.valid_from,
      config: r.regra as unknown as Record<string, unknown>,
      reason: dto.reason?.trim() || null,
      created_by: user.id,
      created_by_name: user.name,
    });
    return versaoView(v);
  }

  /** Mesma função do cálculo real; não grava nada. Com `days`, calcula a SEMANA (contrato §32.3). */
  async simular(dto: SimularDto, agora = new Date()): Promise<SimulacaoView> {
    let regra: RegraBruta;
    let version: number | null = null;
    let aplicada: RegraAplicada | undefined;
    // L13 §45.5: `consultant_id` só existe com a flag (null/ausente = ignorado, como os campos novos dos outros lotes).
    if (dto.consultant_id != null && !this.opcoes.porConsultorLigado)
      throw new UnprocessableEntityException({
        code: 'PER_CONSULTANT_DISABLED',
        message: 'consultant_id: a regra por consultor precisa de FIELD_EARNINGS_PER_CONSULTANT_ENABLED (e FIELD_EARNINGS_ENABLED) ligadas.',
      });
    if (dto.config !== undefined) {
      regra = this.validar(dto.config);
    } else if (dto.consultant_id != null) {
      const ctx = await this.contexto(agora);
      const c = await this.consultorOu404(dto.consultant_id);
      await this.carregarProprias(ctx, [c.id]);
      const v = versaoVigente(this.versoesDe(ctx, c.id), ctx.hoje) ?? ctx.vigente;
      regra = v.config;
      version = v.version;
      aplicada = this.regraAplicada(ctx, c, ctx.hoje);
    } else {
      const ctx = await this.contexto(agora);
      regra = ctx.vigente.config;
      version = ctx.vigente.version;
    }
    const d = calcularDia(
      regra,
      {
        dia: todaySp(agora),
        signups: dto.signups_confirmed,
        visits: dto.visits ?? 0,
        journey_open: dto.journey_open ?? false,
        elegivel: true,
        ...(dto.route_assigned ? { route_assigned: true } : {}),
        ...(dto.worked_minutes !== undefined ? { worked_minutes: dto.worked_minutes } : {}),
      },
      version,
    );
    const mes = this.simularMes(regra, version, dto.month_signups, agora);
    const base: SimulacaoView = {
      day: { total_cents: d.total_cents, conta: d.conta, rule_version: version },
      ...(mes ? { month: mes } : {}),
      ...(aplicada ? { rule: aplicada } : {}),
    };
    if (!dto.days?.length) return base;
    const from = inicioDaSemana(todaySp(agora), regra.week_start_weekday);
    const entradas: Record<string, EntradaDia> = {};
    dto.days.forEach((x, i) => {
      const dia = addDays(from, i);
      entradas[dia] = {
        dia,
        signups: x.signups,
        visits: x.visits ?? 0,
        journey_open: x.journey_open ?? false,
        elegivel: true,
        ...(x.route_assigned ? { route_assigned: true } : {}),
        ...(x.worked_minutes !== undefined ? { worked_minutes: x.worked_minutes } : {}),
      };
    });
    const w = calcularSemana({
      from,
      to: addDays(from, 6),
      hoje: addDays(from, dto.days.length - 1),
      versoes: [{ version: version ?? 0, valid_from: VIGENCIA_INICIAL, config: regra }],
      entradas,
    });
    return {
      ...base,
      week: {
        total_cents: w.total_cents,
        days_cents: w.days_cents,
        week_part_cents: w.week_part_cents,
        days: w.days.filter((x) => !x.futuro).map((x) => ({ day: x.dia, total_cents: x.total_cents, conta: x.conta })),
        conta: w.conta,
        rule_version: version,
      },
    };
  }

  /** L11 §43.5: a parte do mês para N cadastros, pela MESMA função do cálculo real (mês corrente, já encerrado). */
  private simularMes(regra: RegraBruta, version: number | null, n: number | undefined, agora: Date): { total_cents: number; conta: string[] } | null {
    if (n === undefined || regra.tiers_period !== 'month') return null;
    const mes = mesDoDia(todaySp(agora));
    const dia1 = `${mes}-01`;
    const m = calcularMes({
      mes,
      hoje: addDays(ultimoDiaDoMes(mes), 1),
      versoes: [{ version: version ?? 0, valid_from: VIGENCIA_INICIAL, config: regra }],
      entradas: { [dia1]: { dia: dia1, signups: n, visits: 0, journey_open: false, elegivel: true } },
      weekStart: regra.week_start_weekday,
    });
    return m ? { total_cents: m.month_part_cents, conta: m.conta } : null;
  }

  private async consultorOu404(id: string): Promise<ConsultorBasico> {
    if (!isUuid(id)) throw notFoundConsultor();
    const [c] = await this.inputs.consultores({ ids: [id] });
    if (!c) throw notFoundConsultor();
    return c;
  }

  // ── L13: regra própria do consultor (§45.4) ─────────────────────────────

  private minValidFrom(ctx: Ctx, c: ConsultorBasico, ultimaFechadaFim: string | null): string {
    const primeira = inicioDaSemana(c.created_day, ctx.weekStart);
    const depoisDaFechada = ultimaFechadaFim ? addDays(ultimaFechadaFim, 1) : primeira;
    return depoisDaFechada > primeira ? depoisDaFechada : primeira;
  }

  async regrasDoConsultor(consultantId: string, agora = new Date()) {
    const c = await this.consultorOu404(consultantId);
    const ctx = await this.contexto(agora);
    await this.carregarProprias(ctx, [c.id]);
    const ultima = await this.repo.ultimaSemanaFechada(c.id);
    return {
      consultant_id: c.id,
      name: c.name,
      today: ctx.hoje,
      current: this.regraAplicada(ctx, c, ctx.hoje),
      own: [...(ctx.proprias.get(c.id) ?? [])].reverse().map(versaoView),
      global_current: versaoView(ctx.vigente),
      min_valid_from: this.minValidFrom(ctx, c, ultima),
    };
  }

  async criarRegraDoConsultor(dto: RegraConsultorDto, user: AuthUser, agora = new Date()) {
    const c = await this.consultorOu404(dto.consultant_id);
    const regra = this.validar(dto.config);
    this.conferirTravas(regra);
    const ctx = await this.contexto(agora);
    const v = await this.repo.emTransacao(c.id, async (tx) => {
      // Sob o MESMO lock do fechamento: a semana não fecha no meio da conferência.
      const proprias = (await tx.versoesDosConsultores([c.id])).get(c.id) ?? [];
      const ultima = await tx.ultimaSemanaFechada(c.id);
      const erro = validarRegraDoConsultor({
        valid_from: dto.valid_from,
        nova: regra,
        geral: ctx.versoes,
        proprias,
        ultimaFechadaFim: ultima,
        primeiraSemana: inicioDaSemana(c.created_day, ctx.weekStart),
      });
      if (erro) {
        const body = { code: erro.code, message: erro.message };
        throw erro.code === 'WEEK_CLOSED' ? new ConflictException(body) : new BadRequestException(body);
      }
      return tx.inserirVersao({
        valid_from: dto.valid_from,
        config: regra as unknown as Record<string, unknown>,
        reason: dto.reason?.trim() || null,
        created_by: user.id,
        created_by_name: user.name,
        consultant_id: c.id,
      });
    });
    return versaoView(v);
  }

  // ── fechamento ──────────────────────────────────────────────────────────

  async fechar(
    p: { week_start: string; consultant_id?: string },
    ator: Ator,
    modo: 'manual' | 'auto',
    agora = new Date(),
  ) {
    const ctx = await this.contexto(agora);
    if (p.week_start !== inicioDaSemana(p.week_start, ctx.weekStart)) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'week_start: informe o primeiro dia de uma semana de pagamento.',
      });
    }
    const to = addDays(p.week_start, 6);
    if (!semanaEncerrada(to, ctx.hoje))
      throw new ConflictException({
        code: 'WEEK_NOT_ENDED',
        message: `A semana ${diaMes(p.week_start)} a ${diaMes(to)} ainda não terminou; só dá para fechar semana encerrada.`,
      });
    const todos = await this.inputs.consultores(p.consultant_id ? { ids: [p.consultant_id] } : {});
    if (p.consultant_id && todos.length === 0) throw notFoundConsultor();
    return this.fecharSemana(ctx, p.week_start, todos, ator, modo, agora, !!p.consultant_id);
  }

  private async fecharSemana(
    ctx: Ctx,
    semana: string,
    todos: ConsultorBasico[],
    ator: Ator,
    modo: 'manual' | 'auto',
    agora: Date,
    propagarErro: boolean,
  ) {
    const to = addDays(semana, 6);
    const consultores = todos.filter((c) => c.created_day <= to);
    const ids = consultores.map((c) => c.id);
    const { porConsultor: fechadasDe } = await this.fechadasDe(
      ids,
      this.semanasAtras(semana, this.janelaTardia(ctx)),
    );
    const tardiasDe = new Map(
      consultores.map((c) => [c.id, this.tardiasPara(ctx, semana, fechadasDe.get(c.id) ?? new Set())]),
    );
    const calcs = await this.calcular(ctx, consultores, [
      ...new Set([semana, ...[...tardiasDe.values()].flat()]),
    ]);
    const periodos: Array<{ consultant_id: string; total_cents: number; already_closed: boolean }> = [];
    const erros: Array<{ consultant_id: string; message: string }> = [];
    for (const c of consultores) {
      try {
        periodos.push(
          await this.fecharConsultor(
            ctx,
            c,
            semana,
            tardiasDe.get(c.id) ?? [],
            calcs.get(c.id),
            ator,
            modo,
            agora,
          ),
        );
      } catch (e) {
        if (propagarErro) throw e;
        this.log.error(
          `fechamento ${semana} falhou para um consultor: ${e instanceof Error ? e.constructor.name : 'erro'}`,
        );
        erros.push({
          consultant_id: c.id,
          message: 'Não foi possível fechar este consultor; tente de novo.',
        });
      }
    }
    return {
      week: { from: semana, to },
      closed: periodos.filter((x) => !x.already_closed).length,
      already_closed: periodos.filter((x) => x.already_closed).length,
      total_cents: periodos.reduce((a, x) => a + x.total_cents, 0),
      periods: periodos,
      ...(erros.length ? { errors: erros } : {}),
    };
  }

  private async fecharConsultor(
    ctx: Ctx,
    c: ConsultorBasico,
    semana: string,
    tardias: readonly string[],
    calcs: ReadonlyMap<string, ResultadoSemana> | undefined,
    ator: Ator,
    modo: 'manual' | 'auto',
    agora: Date,
  ) {
    return this.repo.emTransacao(c.id, async (tx) => {
      const [existente] = await tx.periodos([c.id], [semana]);
      if (existente) return { consultant_id: c.id, total_cents: existente.total_cents, already_closed: true };
      // L13 §45.4: a regra própria nasce sob este mesmo lock; se mudou depois do cálculo, não fecha com a regra velha.
      if (this.opcoes.porConsultorLigado) {
        const agoraProprias = (await tx.versoesDosConsultores([c.id])).get(c.id) ?? [];
        if (agoraProprias.length !== (ctx.proprias.get(c.id)?.length ?? 0))
          throw new ConflictException({ code: 'RULE_CHANGED', message: 'A regra deste consultor mudou enquanto a semana era calculada. Tente fechar de novo.' });
      }
      const lancado =
        (await tx.lancadoAccrual([c.id], [semana, ...tardias])).get(c.id) ?? new Map<string, JaLancado>();
      const deltas = this.plano(semana, tardias, calcs, lancado);
      await this.lancarDeltas(
        tx,
        ctx,
        c.id,
        deltas.filter((d) => d.delta.work_week === semana),
        'weekly_close',
        ator,
      );
      await this.lancarDeltas(
        tx,
        ctx,
        c.id,
        deltas.filter((d) => d.delta.work_week !== semana),
        'late_confirmation',
        ator,
        { late: true },
      );
      const entradas = await tx.lancamentos([c.id], { payout_week: semana });
      const total = entradas.reduce((a, l) => a + l.amount_cents, 0);
      const r = await tx.inserirPeriodo({
        consultant_id: c.id,
        week_start: semana,
        week_end: addDays(semana, 6),
        total_cents: total,
        entries: entradas.length,
        rule_version: versaoVigente(this.versoesDe(ctx, c.id), semana)?.version ?? ctx.vigente.version,
        closed_at: agora,
        closed_by: ator.id,
        closed_by_name: ator.name,
        closed_mode: modo,
      });
      return { consultant_id: c.id, total_cents: r.row.total_cents, already_closed: !r.criado };
    });
  }

  /**
   * Confirmações tardias de semanas JÁ fechadas entram na primeira semana ainda aberta depois delas (nunca
   * reabrem a fechada). É a mesma regra da leitura e do fechamento, então o número da tela não muda ao lançar.
   */
  async reconciliar(p: { consultant_id?: string }, ator: Ator, agora = new Date()) {
    const ctx = await this.contexto(agora);
    const consultores = await this.inputs.consultores(p.consultant_id ? { ids: [p.consultant_id] } : {});
    if (p.consultant_id && consultores.length === 0) throw notFoundConsultor();
    const ids = consultores.map((c) => c.id);
    const grace = ctx.vigente.config.late_grace_days;
    const candidatas = this.semanasAtras(ctx.semanaAtual, this.janelaTardia(ctx));
    const { porConsultor: fechadasDe } = await this.fechadasDe(ids, candidatas);
    const tardiasDe = new Map(
      consultores.map((c) => {
        const f = fechadasDe.get(c.id) ?? new Set<string>();
        return [
          c.id,
          candidatas.filter((w) => f.has(w) && dentroDoPrazoTardio(addDays(w, 6), ctx.hoje, grace)),
        ] as const;
      }),
    );
    const calcs = await this.calcular(ctx, consultores, [...new Set([...tardiasDe.values()].flat())]);
    let posted = 0;
    let total = 0;
    for (const c of consultores) {
      const minhas = tardiasDe.get(c.id) ?? [];
      if (!minhas.length) continue;
      const fechadas = fechadasDe.get(c.id) ?? new Set<string>();
      const r = await this.repo.emTransacao(c.id, async (tx) => {
        const lancado = (await tx.lancadoAccrual([c.id], minhas)).get(c.id) ?? new Map<string, JaLancado>();
        const deltas = minhas.flatMap((w) => {
          const calc = calcs.get(c.id)?.get(w);
          return calc
            ? planejarLancamentos(alvosDaSemana(calc), lancado).map((delta) => ({
                delta,
                calc,
                payout: semanaDePagamento(w, fechadas),
              }))
            : [];
        });
        const n = await this.lancarDeltas(tx, ctx, c.id, deltas, 'late_confirmation', ator, { late: true });
        return { n, soma: deltas.reduce((a, d) => a + d.delta.delta_cents, 0) };
      });
      posted += r.n;
      total += r.soma;
    }
    return { posted, total_cents: total };
  }

  /** Início da semana de pagamento corrente (a que recebe ajustes), pela regra vigente. */
  async semanaCorrente(agora = new Date()): Promise<string> {
    return (await this.contexto(agora)).semanaAtual;
  }

  /** Calendário da regra vigente (F9): hoje, semana corrente, 1º dia da semana e dia do Pix. */
  async calendario(agora = new Date()): Promise<{ hoje: string; semanaAtual: string; weekStart: number; payoutWeekday: number }> {
    const ctx = await this.contexto(agora);
    return { hoje: ctx.hoje, semanaAtual: ctx.semanaAtual, weekStart: ctx.weekStart, payoutWeekday: ctx.vigente.config.payout_weekday };
  }

  // ── ajustes manuais ─────────────────────────────────────────────────────

  async ajustar(dto: AjusteDto, user: AuthUser, agora = new Date()) {
    const ctx = await this.contexto(agora);
    const [c] = await this.inputs.consultores({ ids: [dto.consultant_id] });
    if (!c) throw notFoundConsultor();
    const reason = dto.reason.trim();
    if (reason.length < 3)
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'reason: informe o motivo do ajuste (ao menos 3 caracteres).',
      });
    if (dto.amount_cents === 0)
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'amount_cents: o ajuste precisa ter valor diferente de zero.',
      });
    const r = await this.repo.emTransacao(c.id, (tx) =>
      tx.inserirLancamento({
        consultant_id: c.id,
        kind: 'adjustment',
        amount_cents: dto.amount_cents,
        work_scope: 'manual',
        work_day: null,
        work_week: ctx.semanaAtual,
        payout_week: ctx.semanaAtual,
        rule_version: null,
        source: 'manual_adjustment',
        reason,
        reverses_id: null,
        idempotency_key: dto.client_id,
        snapshot: { by: user.name, reason, amount_cents: dto.amount_cents },
        created_by: user.id,
        created_by_name: user.name,
      }),
    );
    return lancamentoView(r.row);
  }

  async estornar(id: string, dto: EstornoDto, user: AuthUser, agora = new Date()) {
    const ctx = await this.contexto(agora);
    const orig = await this.repo.lancamentoPorId(id);
    if (!orig) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Lançamento não encontrado.' });
    if (orig.kind !== 'adjustment') {
      throw new UnprocessableEntityException({
        code: 'NOT_REVERSIBLE',
        message:
          'Só ajuste manual pode ser estornado. Para desfazer um ganho calculado, lance um ajuste negativo com motivo.',
      });
    }
    if (orig.source === 'payout_difference') {
      throw new UnprocessableEntityException({
        code: 'NOT_REVERSIBLE',
        message: 'Este ajuste veio de um Pix pago com valor diferente. Para desfazer, estorne o pagamento na tela de Pagamentos.',
      });
    }
    const reason = dto.reason.trim();
    if (reason.length < 3)
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'reason: informe o motivo do estorno (ao menos 3 caracteres).',
      });
    const r = await this.repo.emTransacao(orig.consultant_id, async (tx) => {
      const jaEstornado = (await tx.lancamentos([orig.consultant_id], { kind: 'reversal' })).find(
        (l) => l.reverses_id === orig.id,
      );
      if (jaEstornado) {
        if (jaEstornado.idempotency_key === dto.client_id) return { criado: false, row: jaEstornado };
        throw new ConflictException({ code: 'ALREADY_REVERSED', message: 'Este ajuste já foi estornado.' });
      }
      return tx.inserirLancamento({
        consultant_id: orig.consultant_id,
        kind: 'reversal',
        amount_cents: -orig.amount_cents,
        work_scope: 'manual',
        work_day: null,
        work_week: ctx.semanaAtual,
        payout_week: ctx.semanaAtual,
        rule_version: null,
        source: 'manual_reversal',
        reason,
        reverses_id: orig.id,
        idempotency_key: dto.client_id,
        snapshot: { by: user.name, reason, reverses: orig.id, original_cents: orig.amount_cents },
        created_by: user.id,
        created_by_name: user.name,
      });
    });
    return lancamentoView(r.row);
  }

  // ── job ─────────────────────────────────────────────────────────────────

  /** Dia da semana e hora de fechar? (`payout_weekday` e `autoclose_hour` da regra vigente; Brasília). */
  async deveFecharAgora(agora: Date): Promise<boolean> {
    const vig = versaoVigente(await this.repo.versoes(), todaySp(agora));
    if (!vig) return false;
    return (
      weekdaySp(agora) === vig.config.payout_weekday && minutesSp(agora) >= vig.config.autoclose_hour * 60
    );
  }

  /**
   * Fecha as semanas encerradas ainda abertas (até 8 para trás) e reconcilia as tardias. Idempotente.
   * Nunca inventa histórico: cada consultor continua a partir do SEU último fechamento; quem ainda não tem
   * nenhum começa pela última semana encerrada.
   */
  async fecharEncerradas(
    agora = new Date(),
  ): Promise<{ semanas: number; fechados: number; tardios: number }> {
    const ctx = await this.contexto(agora);
    const ator: Ator = { id: null, name: 'sistema (fechamento automático)' };
    const ultimaEncerrada = addDays(ctx.semanaAtual, -7);
    const todos = await this.inputs.consultores({});
    const primeiras = await this.repo.primeiraSemanaPorConsultor(todos.map((c) => c.id));
    let fechados = 0;
    let semanas = 0;
    for (const w of this.semanasAtras(ctx.semanaAtual, MAX_SEMANAS_AUTOCLOSE).reverse()) {
      const elegiveis = todos.filter((c) => w >= (primeiras.get(c.id) ?? ultimaEncerrada));
      if (!elegiveis.length) continue;
      const r = await this.fecharSemana(ctx, w, elegiveis, ator, 'auto', agora, false);
      semanas++;
      fechados += r.closed;
    }
    const t = await this.reconciliar({}, ator, agora);
    return { semanas, fechados, tardios: t.posted };
  }
}
