import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CampoConsultant } from '../../../common/auth/campo-consultant';
import { CampoRoute } from '../../../common/decorators/campo-route.decorator';
import { CurrentConsultant } from '../../../common/decorators/current-consultant.decorator';
import { DashboardLigadoGuard, DaySummaryLigadoGuard } from './lovable.guards';
import { PainelQueryDto, ResumoDiaQueryDto } from './painel.dto';
import { PainelService } from './painel.service';
import { ResumoDiaService } from './resumo-dia.service';

/** Painel do gestor (contrato §33.4). Equipe (sem `@CampoRoute()`: token de consultor = 401). Antes do `:id` de `/v1/consultores`. */
@ApiTags('Painel do gestor')
@ApiBearerAuth()
@UseGuards(DashboardLigadoGuard)
@Controller('v1/consultores/dashboard')
export class PainelEquipeController {
  constructor(private readonly painel: PainelService) {}

  @Get()
  get(@Query() q: PainelQueryDto) {
    return this.painel.painel(q);
  }
}

/** Resumo do dia de um consultor, para a equipe (contrato §33.5). */
@ApiTags('Resumo do dia')
@ApiBearerAuth()
@UseGuards(DaySummaryLigadoGuard)
@Controller('v1/consultores')
export class ResumoDiaEquipeController {
  constructor(private readonly resumo: ResumoDiaService) {}

  @Get(':id/days/:day/summary')
  get(@Param('id') id: string, @Param('day') day: string) {
    return this.resumo.daEquipe(id, day);
  }
}

/** "Resultado do seu dia" do PRÓPRIO consultor (contrato §33.5). */
@ApiTags('Campo')
@ApiBearerAuth()
@CampoRoute()
@UseGuards(DaySummaryLigadoGuard)
@Controller('v1/campo/day-summary')
export class ResumoDiaCampoController {
  constructor(private readonly resumo: ResumoDiaService) {}

  @Get()
  get(@CurrentConsultant() c: CampoConsultant, @Query() q: ResumoDiaQueryDto) {
    return this.resumo.doConsultor(c, q.day);
  }
}
