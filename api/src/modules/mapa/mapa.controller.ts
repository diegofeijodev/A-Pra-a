import { Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminOnly } from '../../common/decorators/admin-only.decorator';
import { MapaService } from './mapa.service';

/** Mapa de calor da praça e a fila da geocodificação (contrato §21.2). */
@ApiTags('Praças')
@ApiBearerAuth()
@Controller('v1/pracas')
export class MapaController {
  constructor(private readonly mapa: MapaService) {}

  @Get(':id/mapa')
  pontos(@Param('id') id: string, @Query('cnae') cnae?: string) {
    return this.mapa.mapa(id, cnae);
  }

  @Get(':id/geo')
  geo(@Param('id') id: string) {
    return this.mapa.geoResumo(id);
  }

  @AdminOnly()
  @HttpCode(200)
  @Post(':id/geo/retry')
  retry(@Param('id') id: string) {
    return this.mapa.geoRetry(id);
  }
}
