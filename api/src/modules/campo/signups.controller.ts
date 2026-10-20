import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CampoConsultant } from '../../common/auth/campo-consultant';
import { CampoRoute } from '../../common/decorators/campo-route.decorator';
import { CurrentConsultant } from '../../common/decorators/current-consultant.decorator';
import { SignupsEquipeQueryDto, SignupsPeriodoDto } from './dto/signups.dto';
import { SignupsLeituraService } from './signups-leitura.service';

/** Cadastros confirmados pelo Freela — equipe (contrato §27.8). Sem `@CampoRoute()`. Declarado ANTES do `:id` de `/v1/consultores`. */
@ApiTags('Consultores de campo')
@ApiBearerAuth()
@Controller('v1/consultores')
export class SignupsEquipeController {
  constructor(private readonly leitura: SignupsLeituraService) {}

  @Get('signups')
  listar(@Query() q: SignupsEquipeQueryDto) {
    return this.leitura.equipe(q);
  }
}

/** Cadastros confirmados do PRÓPRIO consultor (contrato §27.8). */
@ApiTags('Campo — cadastros confirmados')
@ApiBearerAuth()
@CampoRoute()
@Controller('v1/campo')
export class SignupsCampoController {
  constructor(private readonly leitura: SignupsLeituraService) {}

  @Get('signups')
  meus(@CurrentConsultant() c: CampoConsultant, @Query() q: SignupsPeriodoDto) {
    return this.leitura.doConsultor(c, q);
  }
}
