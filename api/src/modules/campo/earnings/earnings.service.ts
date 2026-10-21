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
import { addDays, minutesSp, todaySp, weekdaySp } from '../../../common/time/dates';
import {
  alvosDaSemana,
  brl,
  calcularDia,
  calcularSemana,
  dataBR,
  dentroDoPrazoTardio,
  diaMes,
  inicioDaSemana,
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
  validarRegra,
  validarVigencia,
  versaoVigente,
  type DeltaLancamento,
  type EntradaDia,
  type JaLancado,
  type RegraBruta,
  type ResultadoDia,
  type ResultadoSemana,
} from '../../../domain/earnings-rules';
import type { RegraConfirmacao } from '../../../domain/signup-sync-rules';
import { RotasConfigService } from '../../rotas/rotas-config.service';
import type { AjusteDto, ConfigRemuneracaoDto, EstornoDto, SimularDto } from './dto/earnings.dto';
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
  /** Como foi gravada (13 chaves + as novas que existirem). */
  config: v.config,
  /** A regra completa (chaves ausentes preenchidas com o padrão = comportamento atual). */
  config_effective: normalizarRegra(v.config),
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
    };
  }

  /** Semana (início) anterior à `from`, `k` vezes. */
  private semanasAtras(from: string, k: number): string[] {
    return Array.from({ length: k }, (_, i) => addDays(from, -7 * (i + 1)));
  }

  /** Quais insumos extras buscar: só se alguma versão da regra usa o recurso (sem uso, nenhuma consulta nova). */
  private extras(ctx: Ctx): InsumosExtras {
    return {
      declared: ctx.versoes.some((v) => v.config.signup_source === 'declared'),
      routes: ctx.versoes.some((v) => v.config.daily_base_condition === 'route_assigned' && (v.config.daily_base_cents ?? 0) > 0),
    };
  }

  private entradasDaSemana(
    ctx: Ctx,
    c: ConsultorBasico,
    from: string,
    brutos: Map<string, DiaBruto> | undefined,
  ): Record<string, EntradaDia> {
    const out: Record<string, EntradaDia> = {};
    for (let i = 0; i < 7; i++) {
      const dia = addDays(from, i);
      const raw = brutos?.get(dia);
      const bruta = versaoVigente(ctx.versoes, dia)?.config;
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
          (dd) => normalizarRegra(versaoVigente(ctx.versoes, dd)?.config ?? CHAVES_VAZIAS).signup_source === 'declared',
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
    const ordenadas = [...semanas].sort();
    const from = ordenadas[0] as string;
    const to = addDays(ordenadas[ordenadas.length - 1] as string, 6);
    const brutos = await this.inputs.dias(
      consultores.map((c) => c.id),
      from,
      to,
      ctx.regraConfirmacao,
      this.extras(ctx),
    );
    for (const c of consultores) {
      for (const w of semanas) {
        out
          .get(c.id)
          ?.set(
            w,
            calcularSemana({
              from: w,
              to: addDays(w, 6),
              hoje: ctx.hoje,
              versoes: ctx.versoes,
              entradas: this.entradasDaSemana(ctx, c, w, brutos.get(c.id)),
            }),
          );
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
    const regra =
      (d.rule_version !== null ? ctx.versoes.find((v) => v.version === d.rule_version)?.config : null) ??
      ctx.vigente.config;
    const dia = d.scope === 'day' ? calc.days.find((x) => x.dia === d.work_day) : null;
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
        })),
        conta: this.contaVisao(v),
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
    return {
      rule_version: ctx.vigente.version,
      confirmation_rule: ctx.regraConfirmacao,
      source: `${fonteDe(ctx.vigente.config)} (versão ${ctx.vigente.version})`,
      ...fonteDeclarada(ctx.vigente.config),
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
      },
    };
  }

  async salvarConfig(dto: ConfigRemuneracaoDto, user: AuthUser, agora = new Date()) {
    const r = validarRegra(dto.config);
    if (!r.ok) throw new BadRequestException({ code: 'VALIDATION_ERROR', message: r.erro });
    if (r.regra.daily_base_condition === 'route_assigned' && (r.regra.daily_base_cents ?? 0) > 0 && !this.opcoes.rotasLigadas)
      throw new ConflictException({
        code: 'ROUTES_DISABLED',
        message:
          'daily_base_condition: a diária por rota atribuída precisa de FIELD_ROUTES_ENABLED ligada; sem rotas da equipe ela pagaria R$ 0 em silêncio.',
      });
    if (r.regra.signup_source === 'declared' && !this.opcoes.declaradasLigado)
      throw new ConflictException({
        code: 'DECLARED_DISABLED',
        message:
          'signup_source: o cadastro declarado precisa de FIELD_DECLARED_SIGNUPS_ENABLED (e FIELD_EARNINGS_ENABLED) ligadas.',
      });
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
    if (dto.config !== undefined) {
      const r = validarRegra(dto.config);
      if (!r.ok) throw new BadRequestException({ code: 'VALIDATION_ERROR', message: r.erro });
      regra = r.regra;
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
      },
      version,
    );
    const base = { day: { total_cents: d.total_cents, conta: d.conta, rule_version: version } };
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
      };
    });
    const w = calcularSemana({
      from,
      to: addDays(from, 6),
      hoje: addDays(from, dto.days.length - 1),
      versoes: [{ version: version ?? 0, valid_from: '1970-01-01', config: regra }],
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
        rule_version: versaoVigente(ctx.versoes, semana)?.version ?? ctx.vigente.version,
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
