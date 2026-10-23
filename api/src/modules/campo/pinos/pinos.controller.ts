import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CampoConsultant } from '../../../common/auth/campo-consultant';
import { CampoRoute } from '../../../common/decorators/campo-route.decorator';
import { CurrentConsultant } from '../../../common/decorators/current-consultant.decorator';
import { MapPinsLigadoGuard } from '../painel/lovable.guards';
import { PinosCampoQueryDto, PinosListaQueryDto, PinosQueryDto } from './pinos.dto';
import { PinosService } from './pinos.service';

/** Mapa por situação — equipe (contrato §34.1–§34.2). Sem `@CampoRoute()`: token de consultor = 401. Antes do `:id`. */
@ApiTags('Mapa por situação')
@ApiBearerAuth()
@UseGuards(MapPinsLigadoGuard)
@Controller('v1/consultores/map/pins')
export class PinosEquipeController {
  constructor(private readonly pinos: PinosService) {}

  @Get()
  list(@Query() q: PinosQueryDto) {
    return this.pinos.equipe(q);
  }

  @Get(':leadId')
  detalhe(@Param('leadId') leadId: string) {
    return this.pinos.detalhe(leadId);
  }
}

/** Clientes > Lista (contrato §34.6, lote E): mesma trava e mesma base do mapa, com os sem localização. Equipe; consultor = 401. */
@ApiTags('Mapa por situação')
@ApiBearerAuth()
@UseGuards(MapPinsLigadoGuard)
@Controller('v1/consultores/map/list')
export class PinosListaController {
  constructor(private readonly pinos: PinosService) {}

  @Get()
  list(@Query() q: PinosListaQueryDto) {
    return this.pinos.lista(q);
  }
}

/** Mapa do consultor: só os estabelecimentos dos roteiros dele ou que ele visitou, na praça dele (contrato §34.4). */
@ApiTags('Campo')
@ApiBearerAuth()
@CampoRoute()
@UseGuards(MapPinsLigadoGuard)
@Controller('v1/campo/map/pins')
export class PinosCampoController {
  constructor(private readonly pinos: PinosService) {}

  @Get()
  list(@CurrentConsultant() c: CampoConsultant, @Query() q: PinosCampoQueryDto) {
    return this.pinos.consultor(c, q);
  }
}
