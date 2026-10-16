import { ConflictException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CampoConsultant } from '../../common/auth/campo-consultant';
import { PrismaService } from '../../common/database/prisma.service';
import { todaySp } from '../../common/time/dates';
import { carimbo, PASSADO_MAXIMO_MS } from '../../domain/campo-rules';
import { COM_LEAD, journeyView, visitView, type JourneyView, type VisitView } from './campo-views';
import type { PontosDto, PosicaoDto, StartJourneyDto } from './dto/campo.dto';
import { violouUnico } from './prisma-errors';

export interface TodayView {
  day: string;
  /** A jornada ABERTA do consultor (null quando não há). */
  journey: JourneyView | null;
  /** Todas as jornadas do dia de Brasília. */
  journeys: JourneyView[];
  open_visit: VisitView | null;
  visits: VisitView[];
  counters: { visits: number; cadastrou_qr: number };
}

const jaAberta = () =>
  new ConflictException({
    code: 'JOURNEY_ALREADY_OPEN',
    message: 'Já existe uma jornada aberta — encerre-a antes de iniciar outra.',
  });
const semJornada = () => new ConflictException({ code: 'NO_OPEN_JOURNEY', message: 'Não há jornada aberta.' });

@Injectable()
export class JourneysService {
  constructor(private readonly prisma: PrismaService) {}

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
    const views = visitas.map((v) => visitView(v, hoje));
    return {
      day: hoje,
      journey: aberta ? journeyView(aberta) : null,
      journeys: jornadas.map(journeyView),
      open_visit: views.find((v) => !v.checkout_at && !v.auto_closed) ?? null,
      visits: views,
      counters: {
        visits: views.length,
        // v1: "cadastrou agora pelo QR"; v2 (§21.6): status final "cadastrou".
        cadastrou_qr: views.filter((v) => v.answers.freela_status === 'cadastrou_qr' || v.answers.final_status === 'cadastrou').length,
      },
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
    // "Iniciar rota" (§21.5): a jornada nasce ligada à rota do dia, se houver.
    const rota = await this.prisma.field_routes.findUnique({
      where: { consultant_id_day: { consultant_id: c.id, day: todaySp(at) } },
      select: { id: true },
    });
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
            route_id: rota?.id ?? null,
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
      const [v] = await this.prisma.$transaction([
        this.prisma.field_visits.updateMany({
          where: { journey_id: j.id, checkout_at: null, auto_closed: false },
          data: { auto_closed: true },
        }),
        this.prisma.field_journeys.updateMany({
          where: { id: j.id, ended_at: null },
          data: { ended_at: fim, auto_closed: true },
        }),
      ]);
      visitas += v.count;
    }
    return { journeys: vencidas.length, visits: visitas };
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
