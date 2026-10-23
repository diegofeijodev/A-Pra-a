import { Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { PracasDoConsultorService } from '../../common/pracas/pracas-do-consultor.service';
import { minutesSp, todaySp, weekdayOf } from '../../common/time/dates';
import {
  calcularAlertas,
  ehDiaDeTrabalho,
  ordenarAlertas,
  type Alerta,
  type ConfigAlertas,
  type EntradaConsultor,
  type GoalView,
} from '../../domain/alerta-rules';
import { situacaoHoje, type SituacaoHoje } from '../../domain/campo-rules';
import { pausasEmMinutos } from '../../domain/intervalo-rules';
import { CONFIG_MODO_DESLIGADO, contaNaMeta } from '../../domain/modo-campo-rules';
import { ModoCampoService } from '../rotas/modo-campo.service';
import { minParaHhmm } from '../../domain/rota-rules';
import { RotasConfigService } from '../rotas/rotas-config.service';
import { LOVABLE_B_FLAGS, ROTAS_LIGADAS, type FlagsLovableB } from '../rotas/rotas.tokens';
import { COM_PRACA } from './campo-prisma';
import { DeclaredSignupsService, type AlertaDivergencia } from './declared/declared-signups.service';
import { PayoutsService } from './payouts/payouts.service';
import { PAYOUTS_OPCOES, type OpcoesPayouts } from './payouts/payouts.tokens';

export interface AtencaoConsultor {
  consultant_id: string;
  name: string;
  praca_id: string;
  praca_name: string;
  phone: string;
  status: SituacaoHoje;
  goal: GoalView;
  alerts: Alerta[];
  /** Lote B §37.6: início do intervalo aberto (ISO) ou `null`; só com `FIELD_BREAKS_ENABLED`. */
  on_break_since?: string | null;
}

export interface AtencaoView {
  day: string;
  generated_at: string;
  now: string;
  dia_de_trabalho: boolean;
  thresholds: Pick<
    ConfigAlertas,
    'alerta_inicio_apos_min' | 'alerta_visita_aberta_min' | 'alerta_sem_registro_min' | 'alerta_ritmo_atras' | 'alerta_parada_vencida_min'
  >;
  alerts: Alerta[];
  consultants: AtencaoConsultor[];
  /** F9 (contrato §29.8): Pix bloqueado/falho. Ausente com `FIELD_PAYOUTS_ENABLED` desligada (e sem consulta). */
  payout_alerts?: Awaited<ReturnType<PayoutsService['alertas']>>;
  /** S3 (contrato §32.7): divergência declaração × Freela. Ausente com `FIELD_DECLARED_SIGNUPS_ENABLED` desligada (e sem consulta). */
  declared_alerts?: AlertaDivergencia[];
}

/** "Atenção agora" e meta da equipe (contrato §25.3): tudo calculado na leitura, nada gravado. */
@Injectable()
export class AtencaoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configs: RotasConfigService,
    @Inject(ROTAS_LIGADAS) private readonly rotasLigadas: boolean,
    @Optional() @Inject(PAYOUTS_OPCOES) private readonly payoutsOpcoes?: OpcoesPayouts,
    @Optional() private readonly payouts?: PayoutsService,
    @Optional() private readonly modo?: ModoCampoService,
    @Optional() private readonly declared?: DeclaredSignupsService,
    @Optional() @Inject(LOVABLE_B_FLAGS) private readonly lovB?: FlagsLovableB,
    @Optional() private readonly pracas?: PracasDoConsultorService,
  ) {}

  async painel(pracaId: string | undefined, agora = new Date()): Promise<AtencaoView> {
    let v = await this.painelBase(pracaId, agora);
    if (this.payoutsOpcoes?.ligado && this.payouts) v = { ...v, payout_alerts: await this.payouts.alertas(pracaId) };
    if (this.declared?.ligado) v = { ...v, declared_alerts: await this.declared.alertas(pracaId, agora) };
    return v;
  }

  private async painelBase(pracaId: string | undefined, agora: Date): Promise<AtencaoView> {
    if (pracaId) {
      const praca = await this.prisma.pracas.findUnique({ where: { id: pracaId }, select: { id: true } });
      if (!praca) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Praça não encontrada.' });
    }
    const hoje = todaySp(agora);
    const agoraMin = minutesSp(agora);
    const diaSemana = weekdayOf(hoje);
    const [config, alertas] = await Promise.all([this.configs.config(), this.configs.alertas()]);

    const consultores = await this.prisma.field_consultants.findMany({
      // Lote F2 §44.7: com a flag, quem tem a praça no CONJUNTO (a meta e o dia são do consultor inteiro).
      where: { active: true, ...(pracaId ? (this.pracas ? this.pracas.ondeAtua(pracaId) : { praca_id: pracaId }) : {}) },
      include: COM_PRACA,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
    const base = {
      day: hoje,
      generated_at: agora.toISOString(),
      now: minParaHhmm(agoraMin),
      dia_de_trabalho: ehDiaDeTrabalho(diaSemana, alertas),
      thresholds: {
        alerta_inicio_apos_min: alertas.alerta_inicio_apos_min,
        alerta_visita_aberta_min: alertas.alerta_visita_aberta_min,
        alerta_sem_registro_min: alertas.alerta_sem_registro_min,
        alerta_ritmo_atras: alertas.alerta_ritmo_atras,
        alerta_parada_vencida_min: alertas.alerta_parada_vencida_min,
      },
    };
    if (consultores.length === 0) return { ...base, alerts: [], consultants: [] };

    const ids = consultores.map((c) => c.id);
    const [jornadas, visitas, paradas] = await Promise.all([
      this.prisma.field_journeys.findMany({
        where: { day: hoje, consultant_id: { in: ids } },
        select: { id: true, consultant_id: true, started_at: true, ended_at: true },
      }),
      this.prisma.field_visits.findMany({
        where: { consultant_id: { in: ids }, journey: { day: hoje } },
        select: { consultant_id: true, checkin_at: true, checkout_at: true, auto_closed: true, outcome: true, flow: true, lead: { select: { name: true } } },
      }),
      this.rotasLigadas
        ? this.prisma.field_route_stops.findMany({
            where: {
              status: 'pendente',
              kind: 'planejada',
              eta_min: { not: null },
              route: { day: hoje, status: 'ativa', consultant_id: { in: ids } },
            },
            select: { name_snap: true, eta_min: true, route: { select: { consultant_id: true } } },
          })
        : Promise.resolve(null),
    ]);
    const abertas = jornadas.filter((j) => j.ended_at === null);
    const ultimosPontos = abertas.length
      ? await this.prisma.field_points.groupBy({ by: ['journey_id'], where: { journey_id: { in: abertas.map((j) => j.id) } }, _max: { at: true } })
      : [];
    const pontoPorJornada = new Map(ultimosPontos.map((u) => [u.journey_id, u._max.at]));
    // Lote B §37.6: intervalos do dia (só com a flag; desligada, nenhuma consulta nova).
    const intervaloLigado = this.lovB?.breaks === true;
    const [pausas, cfgIntervalo] = intervaloLigado
      ? await Promise.all([
          this.prisma.field_journey_breaks.findMany({
            where: { journey_id: { in: jornadas.map((j) => j.id) } },
            select: { consultant_id: true, started_at: true, ended_at: true },
            orderBy: { started_at: 'asc' },
          }),
          this.configs.intervalo(),
        ])
      : [null, null];

    const modoCfg = this.modo?.ligado ? await this.modo.config() : CONFIG_MODO_DESLIGADO;
    const entradas: EntradaConsultor[] = consultores.map((c) => {
      const js = jornadas.filter((j) => j.consultant_id === c.id);
      const vs = visitas.filter((v) => v.consultant_id === c.id);
      const situacao = situacaoHoje(js);
      const instantes: Date[] = [];
      for (const j of js.filter((x) => x.ended_at === null)) {
        instantes.push(j.started_at);
        const p = pontoPorJornada.get(j.id);
        if (p) instantes.push(p);
      }
      if (situacao === 'em_jornada') {
        for (const v of vs) instantes.push(v.checkin_at, ...(v.checkout_at ? [v.checkout_at] : []));
      }
      const aberta = vs.filter((v) => !v.checkout_at && !v.auto_closed).sort((a, b) => b.checkin_at.getTime() - a.checkin_at.getTime())[0];
      return {
        id: c.id,
        name: c.name,
        phone: c.phone,
        praca_id: c.praca_id,
        praca_name: c.praca.name,
        active: c.active,
        situacao,
        ultimoRegistro: instantes.length ? new Date(Math.max(...instantes.map((d) => d.getTime()))) : null,
        visitaAberta: aberta ? { nome: aberta.lead.name, checkin_at: aberta.checkin_at } : null,
        // §30.1: estabelecimento fechado não conta como visita para a meta — exceto no fluxo `simples` (§31.6).
        feitas: vs.filter((v) => contaNaMeta(v, modoCfg)).length,
        paradasPendentes: paradas
          ? paradas.filter((s) => s.route.consultant_id === c.id).map((s) => ({ nome: s.name_snap, eta_min: s.eta_min! }))
          : null,
        ...(pausas
          ? (() => {
              const ps = pausas.filter((b) => b.consultant_id === c.id);
              const aberta = situacao === 'em_jornada' ? ps.find((b) => !b.ended_at) : undefined;
              return { intervaloAberto: aberta?.started_at ?? null, pausas: pausasEmMinutos(ps, agora) };
            })()
          : {}),
      };
    });

    const resultado = calcularAlertas({
      agora,
      agoraMin,
      diaSemana,
      config,
      alertas,
      consultores: entradas,
      ...(cfgIntervalo ? { intervalo: { alerta_intervalo_min: cfgIntervalo.alerta_intervalo_min } } : {}),
    });
    return {
      ...base,
      alerts: resultado.flatMap((r) => r.alerts).sort(ordenarAlertas),
      consultants: resultado.map((r) => ({
        consultant_id: r.consultor.id,
        name: r.consultor.name,
        praca_id: r.consultor.praca_id,
        praca_name: r.consultor.praca_name,
        phone: r.consultor.phone,
        status: r.consultor.situacao,
        goal: r.goal,
        alerts: r.alerts,
        ...(intervaloLigado ? { on_break_since: r.consultor.intervaloAberto?.toISOString() ?? null } : {}),
      })),
    };
  }
}
