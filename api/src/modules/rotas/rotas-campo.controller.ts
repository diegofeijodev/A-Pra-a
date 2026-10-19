import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CampoConsultant } from '../../common/auth/campo-consultant';
import { CampoRoute } from '../../common/decorators/campo-route.decorator';
import { CurrentConsultant } from '../../common/decorators/current-consultant.decorator';
import { AcaoParadaDto, GerarRotaDto, PosicaoRotaDto, PularParadaDto } from './dto/rotas.dto';
import { RotasCampoService } from './rotas-campo.service';

/** Roteiro do dia do consultor (`/v1/campo/route/*`) — contrato §23.3. */
@ApiTags('Campo — roteiro')
@ApiBearerAuth()
@CampoRoute()
@Controller('v1/campo/route')
export class RotasCampoController {
  constructor(private readonly rotas: RotasCampoService) {}

  @Get('today')
  today(@CurrentConsultant() c: CampoConsultant) {
    return this.rotas.today(c);
  }

  @HttpCode(200)
  @Post('generate')
  generate(@CurrentConsultant() c: CampoConsultant, @Body() dto: GerarRotaDto) {
    return this.rotas.generate(c, dto);
  }

  @HttpCode(200)
  @Post('reoptimize')
  reoptimize(@CurrentConsultant() c: CampoConsultant, @Body() dto: PosicaoRotaDto) {
    return this.rotas.reoptimize(c, dto);
  }

  @HttpCode(200)
  @Post('stops/:id/skip')
  skip(@CurrentConsultant() c: CampoConsultant, @Param('id') id: string, @Body() dto: PularParadaDto) {
    return this.rotas.skip(c, id, dto);
  }

  @HttpCode(200)
  @Post('stops/:id/defer')
  defer(@CurrentConsultant() c: CampoConsultant, @Param('id') id: string, @Body() dto: AcaoParadaDto) {
    return this.rotas.defer(c, id, dto);
  }

  @HttpCode(200)
  @Post('stops/:id/undo')
  undo(@CurrentConsultant() c: CampoConsultant, @Param('id') id: string, @Body() dto: AcaoParadaDto) {
    return this.rotas.undo(c, id, dto);
  }
}
