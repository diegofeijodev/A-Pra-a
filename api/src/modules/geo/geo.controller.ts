import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { MunicipiosQueryDto, VizinhasQueryDto } from './dto/geo.dto';
import { GeoService, RAIO_KM_PADRAO } from './geo.service';

// Municípios do IBGE (coordenadas + população, Censo 2022) — dado estático em
// `data/municipios.json` (ver `.prototype/src/lib/praca/geo.ts`). Toda a rota
// é pública: usada na tela de abertura de praça, antes de existir vínculo com
// uma praça específica.
@ApiTags('Geo')
@Controller('v1/geo')
export class GeoController {
  constructor(private readonly geo: GeoService) {}

  @Public()
  @Get('estados')
  estados() {
    return this.geo.estados();
  }

  // Rota estática ANTES de 'municipios/:ibge/vizinhas'.
  @Public()
  @Get('municipios')
  municipios(@Query() query: MunicipiosQueryDto) {
    return this.geo.municipiosPorUf(query.uf);
  }

  @Public()
  @Get('municipios/:ibge/vizinhas')
  vizinhas(@Param('ibge') ibge: string, @Query() query: VizinhasQueryDto) {
    const centro = this.geo.find(ibge);
    if (!centro) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Município não encontrado.' });

    const raioKm = query.km ?? RAIO_KM_PADRAO;
    const vizinhas = this.geo.cidadesNoRaio(ibge, raioKm);
    const popTotal = vizinhas.reduce((acc, v) => acc + v.pop, 0) + centro.pop;

    return { centro, raio_km: raioKm, vizinhas, pop_total: popTotal };
  }
}
