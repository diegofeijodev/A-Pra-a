import { ConflictException, Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CampoConsultant } from '../../common/auth/campo-consultant';
import { PrismaService } from '../../common/database/prisma.service';
import { minutesSp, todaySp, weekdayOf } from '../../common/time/dates';
import { ehDiaDeTrabalho, metaDoDia, type GoalView } from '../../domain/alerta-rules';
import { carimbo, PASSADO_MAXIMO_MS } from '../../domain/campo-rules';
import { fimDaPausa, pausasEmMinutos, type PausaMin } from '../../domain/intervalo-rules';
import { CONFIG_MODO_DESLIGADO, contaNaMeta } from '../../domain/modo-campo-rules';
import { breakView, encerrarIntervaloAberto, type BreakView } from './breaks-views';
import { ModoCampoService } from '../rotas/modo-campo.service';
import { COM_LEAD, journeyView, visitView, type JourneyView, type VisitView } from './campo-views';
import type { PontosDto, PosicaoDto, StartJourneyDto } from './dto/campo.dto';
import { RotasCampoService } from '../rotas/rotas-campo.service';
import { RotasConfigService } from '../rotas/rotas-config.service';
import { LOVABLE_B_FLAGS, type FlagsLovableB } from '../rotas/rotas.tokens';
import { LOVABLE_E_FLAGS, type FlagsLovableE } from '../../common/flags/lovable-e.flags';
import { violouUnico } from './prisma-errors';
import { SignupsLeituraService, type Contagem } from './signups-leitura.service';

export interface TodayView {
  day: string;
  /** A jornada ABERTA do consultor (null quando não há). */
  journey: JourneyView | null;
  /** Todas as jornadas do dia de Brasília. */
  journeys: JourneyView[];
  open_visit: VisitView | null;
  visits: VisitView[];
  counters: { visits: number; cadastrou_qr: number; closed: number; cadastrou_agora: number };
  /** Meta e ritmo do próprio consultor, com a conta (contrato §25.5); `null` se a configuração não pôde ser lida. */
  goal: (GoalView & { params: GoalParams }) | null;
  /** Cadastros confirmados pelo Freela hoje/na semana, com a regra e a fonte (contrato §27.8); `null` se não pôde ser lido. */
  signups_confirmed: Contagem | null;
  /** Lote B §37.6 (só com `FIELD_BREAKS_ENABLED`): os intervalos do dia e o aberto. */
  breaks?: BreakView[];
  breaks_open?: BreakView | null;
}

/** Horários da configuração: o aparelho recalcula o ritmo com o relógio dele, mesmo sem sinal. */
export interface GoalParams {
  meta_diaria: number;
  janela_inicio: string;
  janela_fim: string;
  almoco_inicio: string;
  almoco_fim: string;
}

const jaAberta = () =>
  new ConflictException({
    code: 'JOURNEY_ALREADY_OPEN',
    message: 'Já existe uma jornada aberta — encerre-a antes de iniciar outra.',
  });
const semJornada = () => new ConflictException({ code: 'NO_OPEN_JOURNEY', message: 'Não há jornada aberta.' });

@Injectable()
export class JourneysService {
  private readonly log = new Logger(JourneysService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly rotas?: RotasCampoService,
    @Optional() private readonly configs?: RotasConfigService,
    @Optional() private readonly signups?: SignupsLeituraService,
    @Optional() private readonly modo?: ModoCampoService,
    @Optional() @Inject(LOVABLE_B_FLAGS) private readonly lovB?: FlagsLovableB,
    @Optional() @Inject(LOVABLE_E_FLAGS) private readonly lovE?: FlagsLovableE,
  ) {}

  /** Meta do dia do consultor. A leitura do Hoje nunca falha por causa dela. */
  private async metaDe(feitas: number, agora: Date, pausas?: PausaMin[]): Promise<TodayView['goal']> {
    if (!this.configs) return null;
    try {
      const [config, alertas] = await Promise.all([this.configs.config(), this.configs.alertas()]);
      const goal = metaDoDia({
        agoraMin: minutesSp(agora),
        feitas,
        config,
        diaDeTrabalho: ehDiaDeTrabalho(weekdayOf(todaySp(agora)), alertas),
        // Lote B §37.6: com intervalo registrado, o real no lugar do almoço (sem intervalo, a conta de hoje).
        ...(pausas && pausas.length ? { pausas } : {}),
      });
      return {
        ...goal,
        params: {
          meta_diaria: config.meta_diaria,
          janela_inicio: config.janela_inicio,
          janela_fim: config.janela_fim,
          almoco_inicio: config.almoco_inicio,
          almoco_fim: config.almoco_fim,
        },
      };
    } catch (e) {
      this.log.warn(`meta do dia não calculada: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  }

  /** Cadastros confirmados hoje/semana (contrato §27.8). A leitura do Hoje nunca falha por causa dela. */
  private async confirmadosDe(consultantId: string, agora: Date): Promise<TodayView['signups_confirmed']> {
    if (!this.signups) return null;
    try {
      return await this.signups.resumoDoConsultor(consultantId, agora);
    } catch {
      return null;
    }
  }

  async today(c: CampoConsultant, agora = new Date()): Promise<TodayView> {
    await this.closeStale(agora, c.id);
    const hoje = todaySp(agora);
    const [jornadas, aberta, visitas] = await Promise.all([
      this.prisma.field_journeys.findMany({ where: { consultant_id: c.id, day: hoje }, orderBy: { started_at: 'asc' } }),
      this.prisma.field_journeys.findFirst({ where: { consultant_id: c.id, ended_at: null } }),
      this.prisma.field_visits.findMany({
        where: { consultant_id: c.id, journey: { day: hoje } },
        include: COM_LEAD,
        orderBy: { checkin_at: 'asc' },
      }),
    ]);
    // Modo do chefe §31: com a flag desligada nenhuma visita é `simples`, então o padrão basta (e nada é lido a mais).
    const modoCfg = this.modo?.ligado ? await this.modo.config() : CONFIG_MODO_DESLIGADO;
    const views = visitas.map((v) => visitView(v, hoje, modoCfg, { checklist: this.lovB?.checklist === true, contact_email: this.lovE?.contact_email === true }));
    // Lote B §37.6: intervalos do dia (só com a flag; desligada, nenhuma consulta nova e nenhuma chave nova).
    const pausas = this.intervaloLigado
      ? await this.prisma.field_journey_breaks.findMany({ where: { consultant_id: c.id, journey: { day: hoje } }, orderBy: { started_at: 'asc' } })
      : null;
    const extraIntervalo = pausas
      ? { breaks: pausas.map((b) => breakView(b, agora)), breaks_open: (() => { const a = pausas.find((b) => !b.ended_at); return a ? breakView(a, agora) : null; })() }
      : {};
    return {
      day: hoje,
      journey: aberta ? journeyView(aberta) : null,
      journeys: jornadas.map(journeyView),
      open_visit: views.find((v) => !v.checkout_at && !v.auto_closed) ?? null,
      visits: views,
      counters: {
        visits: views.length,
        cadastrou_qr: views.filter((v) => v.answers.freela_status === 'cadastrou_qr').length,
        // §30.1: estabelecimento fechado fica fora da meta; o total (`visits`) não muda de significado.
        closed: views.filter((v) => v.answers.outcome === 'fechado').length,
        // Modo do chefe §31.6: "Cadastrou agora" do fluxo simples (declarado). `cadastrou_qr` continua só QR.
        cadastrou_agora: views.filter((v) => v.answers.result === 'cadastrou').length,
      },
      // §31.6: no fluxo `simples` o "fechado" fotografado conta (se configurado); no `completo` fica fora (§30.1).
      goal: await this.metaDe(
        views.filter((v) => contaNaMeta({ outcome: v.answers.outcome, flow: v.flow }, modoCfg)).length,
        agora,
        pausas ? pausasEmMinutos(pausas, agora) : undefined,
      ),
      signups_confirmed: await this.confirmadosDe(c.id, agora),
      ...extraIntervalo,
    };
  }

  async start(c: CampoConsultant, dto: StartJourneyDto, agora = new Date()): Promise<JourneyView> {
    const mesma = await this.prisma.field_journeys.findUnique({ where: { client_id: dto.client_id } });
    if (mesma) return this.daMesmaPessoa(mesma, c);

    // A de ontem que ficou aberta (API fora à meia-noite) não pode travar o dia.
    await this.closeStale(agora, c.id);
    const aberta = await this.prisma.field_journeys.findFirst({
      where: { consultant_id: c.id, ended_at: null },
      select: { id: true },
    });
    if (aberta) throw jaAberta();

    const { at, ajustado } = carimbo(dto.at, agora, null);
    const id = randomUUID();
    try {
      await this.prisma.$transaction([
        this.prisma.field_journeys.create({
          data: {
            id,
            consultant_id: c.id,
            day: todaySp(at),
            client_id: dto.client_id,
            started_at: at,
            start_lat: dto.lat,
            start_lng: dto.lng,
            start_accuracy: dto.accuracy,
          },
        }),
        this.prisma.field_points.create({
          data: {
            journey_id: id,
            at,
            lat: dto.lat,
            lng: dto.lng,
            accuracy: dto.accuracy,
            kind: 'start',
            client_id: randomUUID(),
            clock_adjusted: ajustado,
          },
        }),
      ]);
    } catch (e) {
      if (!violouUnico(e)) throw e;
      // Corrida (dois toques ou reenvio simultâneo): se foi o mesmo client_id, é a mesma jornada.
      const ganhou = await this.prisma.field_journeys.findUnique({ where: { client_id: dto.client_id } });
      if (ganhou) return this.daMesmaPessoa(ganhou, c);
      throw jaAberta();
    }
    // Roteiro automático (contrato §23.3): depois do commit e sem nunca falhar o início da jornada.
    await this.rotas?.gerarAoIniciar(c, { lat: dto.lat, lng: dto.lng }, agora);
    return journeyView(await this.prisma.field_journeys.findUniqueOrThrow({ where: { id } }));
  }

  async addPoints(c: CampoConsultant, dto: PontosDto, agora = new Date()): Promise<{ accepted: number; duplicates: number }> {
    const aberta = await this.abertaOuFalha(c.id);
    const existentes = await this.prisma.field_points.findMany({
      where: { client_id: { in: dto.points.map((p) => p.client_id) } },
      select: { client_id: true },
    });
    const vistos = new Set(existentes.map((p) => p.client_id));
    const novos = dto.points.filter((p) => {
      if (vistos.has(p.client_id)) return false;
      vistos.add(p.client_id);
      return true;
    });
    if (novos.length > 0) {
      await this.prisma.field_points.createMany({
        data: novos.map((p) => {
          const { at, ajustado } = carimbo(p.at, agora, aberta.started_at);
          return {
            journey_id: aberta.id,
            at,
            lat: p.lat,
            lng: p.lng,
            accuracy: p.accuracy,
            kind: 'track',
            client_id: p.client_id,
            clock_adjusted: ajustado,
          };
        }),
        skipDuplicates: true,
      });
    }
    return { accepted: novos.length, duplicates: dto.points.length - novos.length };
  }

  async end(c: CampoConsultant, dto: PosicaoDto, agora = new Date()): Promise<JourneyView> {
    const aberta = await this.prisma.field_journeys.findFirst({ where: { consultant_id: c.id, ended_at: null } });
    if (!aberta) {
      // Reenvio da fila depois de a resposta se perder: devolve o que já foi feito.
      const ultima = await this.prisma.field_journeys.findFirst({
        where: { consultant_id: c.id, ended_at: { not: null } },
        orderBy: { ended_at: 'desc' },
      });
      if (ultima?.ended_at && agora.getTime() - ultima.ended_at.getTime() < PASSADO_MAXIMO_MS) {
        return journeyView(ultima);
      }
      throw semJornada();
    }
    const visitasAbertas = await this.prisma.field_visits.count({
      where: { journey_id: aberta.id, checkout_at: null, auto_closed: false },
    });
    if (visitasAbertas > 0) {
      throw new ConflictException({
        code: 'VISIT_OPEN',
        message: 'Faça o checkout da visita aberta antes de encerrar a jornada.',
      });
    }

    const { at, ajustado } = carimbo(dto.at, agora, aberta.started_at);
    await this.prisma.$transaction(async (tx) => {
      // Condicional: dois "encerrar" simultâneos gravam um ponto de fim só.
      const r = await tx.field_journeys.updateMany({
        where: { id: aberta.id, ended_at: null },
        data: { ended_at: at, end_lat: dto.lat, end_lng: dto.lng, end_accuracy: dto.accuracy },
      });
      if (r.count === 1) {
        // Lote B §37.5: o fim da jornada encerra o intervalo aberto no mesmo instante.
        if (this.intervaloLigado) await encerrarIntervaloAberto(tx, aberta.id, at, 'journey_end');
        await tx.field_points.create({
          data: {
            journey_id: aberta.id,
            at,
            lat: dto.lat,
            lng: dto.lng,
            accuracy: dto.accuracy,
            kind: 'end',
            client_id: randomUUID(),
            clock_adjusted: ajustado,
          },
        });
      }
    });
    return journeyView(await this.prisma.field_journeys.findUniqueOrThrow({ where: { id: aberta.id } }));
  }

  /**
   * Fechamento da meia-noite (§7): jornada de dia ANTERIOR ainda aberta fecha na
   * hora do último ponto, com `auto_closed`; as visitas dela sem checkout ficam
   * "sem checkout" e não tocam o CRM. "Dia anterior" é `day < todaySp(agora)` —
   * Brasília, não UTC (às 22h30 BRT o UTC já virou). Não filtra `active`: o
   * consultor desativado no meio do dia também tem a jornada fechada.
   */
  async closeStale(agora = new Date(), consultantId?: string): Promise<{ journeys: number; visits: number }> {
    const hoje = todaySp(agora);
    const vencidas = await this.prisma.field_journeys.findMany({
      where: { ended_at: null, day: { lt: hoje }, ...(consultantId ? { consultant_id: consultantId } : {}) },
      select: { id: true, started_at: true, points: { orderBy: { at: 'desc' }, take: 1, select: { at: true } } },
    });
    let visitas = 0;
    for (const j of vencidas) {
      const fim = j.points[0]?.at ?? j.started_at;
      // Lote B §37.5: o intervalo aberto fecha junto, no fim da jornada (nunca antes do próprio início).
      const pausa = this.intervaloLigado
        ? await this.prisma.field_journey_breaks.findFirst({ where: { journey_id: j.id, ended_at: null }, select: { id: true, started_at: true } })
        : null;
      const ops = [
        this.prisma.field_visits.updateMany({
          where: { journey_id: j.id, checkout_at: null, auto_closed: false },
          data: { auto_closed: true },
        }),
        this.prisma.field_journeys.updateMany({
          where: { id: j.id, ended_at: null },
          data: { ended_at: fim, auto_closed: true },
        }),
      ];
      if (pausa) {
        ops.push(
          this.prisma.field_journey_breaks.updateMany({
            where: { id: pausa.id, ended_at: null },
            data: { ended_at: fimDaPausa(pausa.started_at, fim), auto_closed: true, end_reason: 'auto' },
          }),
        );
      }
      const [v] = await this.prisma.$transaction(ops);
      visitas += v!.count;
    }
    return { journeys: vencidas.length, visits: visitas };
  }

  private get intervaloLigado(): boolean {
    return this.lovB?.breaks === true;
  }

  async abertaOuFalha(consultantId: string) {
    const aberta = await this.prisma.field_journeys.findFirst({ where: { consultant_id: consultantId, ended_at: null } });
    if (!aberta) throw semJornada();
    return aberta;
  }

  private daMesmaPessoa(j: Parameters<typeof journeyView>[0] & { consultant_id: string }, c: CampoConsultant): JourneyView {
    if (j.consultant_id !== c.id) {
      throw new ConflictException({ code: 'CLIENT_ID_IN_USE', message: 'Identificador de envio já usado.' });
    }
    return journeyView(j);
  }
}
