import { BadRequestException, Injectable } from '@nestjs/common';
import { CampoConsultant } from '../../common/auth/campo-consultant';
import { PrismaService } from '../../common/database/prisma.service';
import {
  caixaEnvolvente,
  distanciaM,
  nomeParecido,
  RAIO_DUPLICADO_M,
  RAIO_PERTO_M,
  type Coordenada,
} from '../../domain/campo-rules';
import { norm } from '../../domain/dedup';
import type { PlacesQueryDto } from './dto/campo.dto';
import { JourneysService } from './journeys.service';

export interface PlaceView {
  id: string;
  name: string;
  address: string;
  stage: number;
  lat: number | null;
  lng: number | null;
  distance_m: number | null;
}

const COLUNAS = { id: true, name: true, address: true, stage: true, lat: true, lng: true } as const;

/** Estabelecimentos (leads) da praça do consultor — §20.3. */
@Injectable()
export class PlacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly journeys: JourneysService,
  ) {}

  /**
   * `?q=` não recebe posição e não exige jornada; `?lat&lng` (e `similar`) só
   * valem com jornada aberta (spec §11: localização só com jornada aberta).
   */
  async list(c: CampoConsultant, q: PlacesQueryDto): Promise<PlaceView[]> {
    if (q.q?.trim()) return this.search(c.praca_id, q.q);
    if (q.lat !== undefined && q.lng !== undefined) {
      await this.journeys.abertaOuFalha(c.id);
      return this.near(c.praca_id, { lat: q.lat, lng: q.lng });
    }
    throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Informe q (nome) ou lat e lng.' });
  }

  /** Raio pelo haversine, depois de um filtro de caixa barato no banco. */
  async near(pracaId: string, ponto: Coordenada, raio = RAIO_PERTO_M, limite = 30): Promise<PlaceView[]> {
    const box = caixaEnvolvente(ponto, raio);
    const linhas = await this.prisma.leads.findMany({
      where: {
        praca_id: pracaId,
        archived: false,
        lat: { gte: box.latMin, lte: box.latMax },
        lng: { gte: box.lngMin, lte: box.lngMax },
      },
      select: COLUNAS,
      take: 500,
    });
    return linhas
      .map((l) => ({ ...l, distance_m: distanciaM(ponto, { lat: l.lat as number, lng: l.lng as number }) }))
      .filter((l) => l.distance_m <= raio)
      .sort((a, b) => a.distance_m - b.distance_m)
      .slice(0, limite);
  }

  /** Por nome, sem acento nem caixa ("cafe" acha "Café"), até 20. */
  async search(pracaId: string, texto: string): Promise<PlaceView[]> {
    const alvo = norm(texto);
    if (!alvo) return [];
    const linhas = await this.prisma.leads.findMany({
      where: { praca_id: pracaId, archived: false },
      select: COLUNAS,
      orderBy: { name: 'asc' },
    });
    return linhas
      .filter((l) => norm(l.name).includes(alvo))
      .slice(0, 20)
      .map((l) => ({ ...l, distance_m: null }));
  }

  /** "Já existe 'X' a 40 m — é esse?": nome parecido a até 100 m. */
  async similar(c: CampoConsultant, q: { name: string; lat: number; lng: number }): Promise<PlaceView[]> {
    await this.journeys.abertaOuFalha(c.id);
    const perto = await this.near(c.praca_id, { lat: q.lat, lng: q.lng }, RAIO_DUPLICADO_M, 10);
    return perto.filter((l) => nomeParecido(l.name, q.name));
  }
}
