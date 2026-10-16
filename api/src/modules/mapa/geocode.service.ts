import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { consultaGeo } from '../../domain/geo-rules';
import { GEOCODER, GeocoderIndisponivel, type Geocoder } from './geocoder';

/** Leads por rodada do relógio — com o Nominatim (1/s) cabe dentro do minuto. */
export const LOTE_GEO = 50;

const espera = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Fila da geocodificação (§21.2): leads `geo_status = "pendente"`, mais antigos
 * primeiro, um por vez. A gravação é condicional (`geo_status` ainda
 * `pendente` e o mesmo endereço): se alguém trocou o endereço no meio, o
 * resultado velho não sobrescreve.
 */
@Injectable()
export class GeocodeService {
  private readonly log = new Logger(GeocodeService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(GEOCODER) private readonly geocoder: Geocoder,
  ) {}

  get provedor(): string {
    return this.geocoder.nome;
  }

  async rodada(limite = LOTE_GEO, pausa: (ms: number) => Promise<void> = espera): Promise<{ ok: number; falhou: number; parou: boolean }> {
    if (this.geocoder.nome === 'off') return { ok: 0, falhou: 0, parou: false };
    const fila = await this.prisma.leads.findMany({
      where: { geo_status: 'pendente', archived: false },
      orderBy: { created_at: 'asc' },
      take: limite,
      select: { id: true, address: true, bairro: true, city: true },
    });
    let ok = 0;
    let falhou = 0;
    for (const [i, lead] of fila.entries()) {
      if (i > 0) await pausa(this.geocoder.intervaloMs);
      const alvo = { id: lead.id, geo_status: 'pendente', address: lead.address };
      if (!lead.address.trim()) {
        await this.prisma.leads.updateMany({ where: alvo, data: { geo_status: 'falhou', geo_error: 'Sem endereço.' } });
        falhou++;
        continue;
      }
      try {
        const achou = await this.geocoder.buscar(consultaGeo(lead));
        if (achou) {
          await this.prisma.leads.updateMany({
            where: alvo,
            data: { lat: achou.lat, lng: achou.lng, geo_status: 'ok', geo_error: null },
          });
          ok++;
        } else {
          await this.prisma.leads.updateMany({
            where: alvo,
            data: { geo_status: 'falhou', geo_error: 'Endereço não encontrado no mapa.' },
          });
          falhou++;
        }
      } catch (e) {
        if (e instanceof GeocoderIndisponivel) {
          this.log.warn(`geocodificação pausada: ${e.message}`);
          return { ok, falhou, parou: true };
        }
        throw e;
      }
    }
    return { ok, falhou, parou: false };
  }
}
