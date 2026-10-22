import { ConflictException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { CampoConsultant } from '../../common/auth/campo-consultant';
import { PrismaService } from '../../common/database/prisma.service';
import { carimbo, PASSADO_MAXIMO_MS } from '../../domain/campo-rules';
import { fimDaPausa } from '../../domain/intervalo-rules';
import { breakView, type BreakRow, type BreakView } from './breaks-views';
import { LOVABLE_B_FLAGS, type FlagsLovableB } from '../rotas/rotas.tokens';
import type { IntervaloDto } from './dto/campo.dto';
import { JourneysService } from './journeys.service';
import { violouUnico } from './prisma-errors';

const desligado = () => new NotFoundException({ code: 'BREAKS_DISABLED', message: 'O intervalo não está ligado neste servidor.' });

/** Intervalo/almoço como evento da jornada (contrato §37). Só com `FIELD_BREAKS_ENABLED`. */
@Injectable()
export class BreaksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly journeys: JourneysService,
    @Optional() @Inject(LOVABLE_B_FLAGS) private readonly flags?: FlagsLovableB,
  ) {}

  get ligado(): boolean {
    return this.flags?.breaks === true;
  }

  async start(c: CampoConsultant, dto: IntervaloDto, agora = new Date()): Promise<BreakView> {
    if (!this.ligado) throw desligado();
    const mesmo = await this.prisma.field_journey_breaks.findUnique({ where: { client_id: dto.client_id } });
    if (mesmo) return this.daMesmaPessoa(mesmo, c, agora);
    const jornada = await this.journeys.abertaOuFalha(c.id);
    const visita = await this.prisma.field_visits.findFirst({
      where: { consultant_id: c.id, checkout_at: null, auto_closed: false },
      select: { id: true },
    });
    if (visita) throw new ConflictException({ code: 'VISIT_OPEN', message: 'Conclua a visita aberta antes de começar o intervalo.' });
    const aberto = await this.prisma.field_journey_breaks.findFirst({ where: { journey_id: jornada.id, ended_at: null }, select: { id: true } });
    if (aberto) throw jaAberto();
    const { at, ajustado } = carimbo(dto.at, agora, jornada.started_at);
    try {
      await this.prisma.field_journey_breaks.create({
        data: {
          journey_id: jornada.id,
          consultant_id: c.id,
          client_id: dto.client_id,
          started_at: at,
          start_lat: dto.lat ?? null,
          start_lng: dto.lng ?? null,
          start_accuracy: dto.accuracy ?? null,
          clock_adjusted: ajustado,
        },
      });
    } catch (e) {
      if (!violouUnico(e)) throw e;
      // Corrida: o mesmo envio (client_id) ganhou, ou outro intervalo abriu antes (índice parcial).
      const ganhou = await this.prisma.field_journey_breaks.findUnique({ where: { client_id: dto.client_id } });
      if (ganhou) return this.daMesmaPessoa(ganhou, c, agora);
      throw jaAberto();
    }
    return breakView(await this.prisma.field_journey_breaks.findUniqueOrThrow({ where: { client_id: dto.client_id } }), agora);
  }

  async end(c: CampoConsultant, dto: IntervaloDto, agora = new Date()): Promise<BreakView> {
    if (!this.ligado) throw desligado();
    const mesmo = await this.prisma.field_journey_breaks.findUnique({ where: { end_client_id: dto.client_id } });
    if (mesmo) return this.daMesmaPessoa(mesmo, c, agora);
    const aberto = await this.prisma.field_journey_breaks.findFirst({
      where: { consultant_id: c.id, ended_at: null },
      orderBy: { started_at: 'desc' },
    });
    if (!aberto) {
      // Fila offline: o check-in (ou o fim da jornada, ou a meia-noite) já encerrou este intervalo — não é erro para o consultor.
      const ultimo = await this.prisma.field_journey_breaks.findFirst({
        where: { consultant_id: c.id, ended_at: { not: null } },
        orderBy: { ended_at: 'desc' },
      });
      if (ultimo?.ended_at && ultimo.end_reason !== 'manual' && agora.getTime() - ultimo.ended_at.getTime() < PASSADO_MAXIMO_MS) {
        return breakView(ultimo, agora);
      }
      throw new ConflictException({ code: 'NO_OPEN_BREAK', message: 'Não há intervalo aberto.' });
    }
    const { at, ajustado } = carimbo(dto.at, agora, aberto.started_at);
    await this.prisma.field_journey_breaks.updateMany({
      where: { id: aberto.id, ended_at: null },
      data: {
        ended_at: fimDaPausa(aberto.started_at, at),
        end_client_id: dto.client_id,
        end_lat: dto.lat ?? null,
        end_lng: dto.lng ?? null,
        end_accuracy: dto.accuracy ?? null,
        end_reason: 'manual',
        ...(ajustado ? { clock_adjusted: true } : {}),
      },
    });
    return breakView(await this.prisma.field_journey_breaks.findUniqueOrThrow({ where: { id: aberto.id } }), agora);
  }

  private daMesmaPessoa(b: BreakRow, c: CampoConsultant, agora: Date): BreakView {
    if (b.consultant_id !== c.id) throw new ConflictException({ code: 'CLIENT_ID_IN_USE', message: 'Identificador de envio já usado.' });
    return breakView(b, agora);
  }
}

const jaAberto = () => new ConflictException({ code: 'BREAK_ALREADY_OPEN', message: 'O intervalo já está aberto.' });
