import { Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
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
import { minParaHhmm } from '../../domain/rota-rules';
import { RotasConfigService } from '../rotas/rotas-config.service';
import { ROTAS_LIGADAS } from '../rotas/rotas.tokens';
import { COM_PRACA } from './campo-prisma';
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
  ) {}

  async painel(pracaId: string | undefined, agora = new Date()): Promise<AtencaoView> {
    const v = await this.painelBase(pracaId, agora);
    if (!this.payoutsOpcoes?.ligado || !this.payouts) return v;
    return { ...v, payout_alerts: await this.payouts.alertas(pracaId) };
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
      where: { active: true, ...(pracaId ? { praca_id: pracaId } : {}) },
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
        select: { consultant_id: true, checkin_at: true, checkout_at: true, auto_closed: true, lead: { select: { name: true } } },
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
        feitas: vs.length,
        paradasPendentes: paradas
          ? paradas.filter((s) => s.route.consultant_id === c.id).map((s) => ({ nome: s.name_snap, eta_min: s.eta_min! }))
          : null,
      };
    });

    const resultado = calcularAlertas({ agora, agoraMin, diaSemana, config, alertas, consultores: entradas });
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
      })),
    };
  }
}
