import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { isUuid } from '../../common/ids/uuid';
import { lerCnaes } from '../campo/campo-cnaes';
import { GeocodeService } from './geocode.service';

export type StatusNoMapa = 'nao_visitado' | 'visitado' | 'cadastrado' | 'com_vaga';

export interface MapPoint {
  id: string;
  name: string;
  lat: number;
  lng: number;
  cnae: string | null;
  classe: string;
  status: StatusNoMapa;
}

export interface MapaView {
  points: MapPoint[];
  sem_localizacao: number;
  cnaes: { code: string | null; label: string; count: number }[];
}

/** O mais avançado vence (§21.2). */
export function statusNoMapa(l: { stage: number; vagas: number; visitas: number }): StatusNoMapa {
  if (l.vagas > 0) return 'com_vaga';
  if (l.stage >= 5) return 'cadastrado';
  if (l.visitas > 0) return 'visitado';
  return 'nao_visitado';
}

/** `?cnae=5611201,5611204` → lista; vazio = todos; código fora de 7 dígitos = 400. */
export function lerFiltroCnae(q: string | undefined): string[] {
  if (!q?.trim()) return [];
  const lista = q.split(',').map((c) => c.trim()).filter(Boolean);
  if (lista.some((c) => !/^\d{7}$/.test(c))) {
    throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'cnae: códigos de 7 dígitos separados por vírgula.' });
  }
  return lista;
}

@Injectable()
export class MapaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly geo: GeocodeService,
  ) {}

  async mapa(pracaId: string, cnaeQ?: string): Promise<MapaView> {
    await this.pracaOrFail(pracaId);
    const filtro = lerFiltroCnae(cnaeQ);
    const [leads, config] = await Promise.all([
      this.prisma.leads.findMany({
        where: { praca_id: pracaId, archived: false },
        select: {
          id: true,
          name: true,
          lat: true,
          lng: true,
          cnae: true,
          classe: true,
          stage: true,
          _count: { select: { vagas: true, field_visits: { where: { checkout_at: { not: null } } } } },
        },
      }),
      lerCnaes(this.prisma),
    ]);
    const contagem = new Map<string | null, number>();
    for (const l of leads) contagem.set(l.cnae, (contagem.get(l.cnae) ?? 0) + 1);
    const cnaes: MapaView['cnaes'] = config.map((c) => ({ code: c.code, label: c.label, count: contagem.get(c.code) ?? 0 }));
    if (contagem.get(null)) cnaes.push({ code: null, label: 'sem CNAE', count: contagem.get(null)! });

    const doFiltro = filtro.length ? leads.filter((l) => l.cnae && filtro.includes(l.cnae)) : leads;
    const points: MapPoint[] = [];
    let semLocalizacao = 0;
    for (const l of doFiltro) {
      if (l.lat == null || l.lng == null) {
        semLocalizacao++;
        continue;
      }
      points.push({
        id: l.id,
        name: l.name,
        lat: l.lat,
        lng: l.lng,
        cnae: l.cnae,
        classe: l.classe,
        status: statusNoMapa({ stage: l.stage, vagas: l._count.vagas, visitas: l._count.field_visits }),
      });
    }
    return { points, sem_localizacao: semLocalizacao, cnaes };
  }

  async geoResumo(pracaId: string): Promise<{ pendente: number; ok: number; falhou: number; sem_endereco: number; geocoder: string }> {
    await this.pracaOrFail(pracaId);
    const grupos = await this.prisma.leads.groupBy({
      by: ['geo_status'],
      where: { praca_id: pracaId, archived: false },
      _count: { _all: true },
    });
    const n = (s: string | null) => grupos.find((g) => g.geo_status === s)?._count._all ?? 0;
    // `null` com lat/lng é localização de check-in de campo — conta como ok.
    const comCheckin = await this.prisma.leads.count({
      where: { praca_id: pracaId, archived: false, geo_status: null, lat: { not: null } },
    });
    return {
      pendente: n('pendente'),
      ok: n('ok') + comCheckin,
      falhou: n('falhou'),
      sem_endereco: n(null) - comCheckin,
      geocoder: this.geo.provedor,
    };
  }

  async geoRetry(pracaId: string): Promise<{ requeued: number }> {
    await this.pracaOrFail(pracaId);
    const r = await this.prisma.leads.updateMany({
      where: { praca_id: pracaId, geo_status: 'falhou', archived: false, address: { not: '' } },
      data: { geo_status: 'pendente', geo_error: null },
    });
    return { requeued: r.count };
  }

  private async pracaOrFail(id: string): Promise<void> {
    const naoAchada = new NotFoundException({ code: 'NOT_FOUND', message: 'Praça não encontrada.' });
    if (!isUuid(id)) throw naoAchada;
    if (!(await this.prisma.pracas.findUnique({ where: { id }, select: { id: true } }))) throw naoAchada;
  }
}
