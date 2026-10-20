import { Body, Controller, Get, HttpCode, Param, Post, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { CampoConsultant } from '../../common/auth/campo-consultant';
import { CampoRoute } from '../../common/decorators/campo-route.decorator';
import { CurrentConsultant } from '../../common/decorators/current-consultant.decorator';
import { CompanySignupService } from './company-signup.service';
import { ReissueLinkDto, SignupCreateDto, SignupsQueryDto } from './dto/company-signup.dto';

/** Cadastro assistido do consultor (`/v1/campo/*`) — contrato §26.3. Tudo do PRÓPRIO consultor. */
@ApiTags('Campo — cadastro assistido')
@ApiBearerAuth()
@CampoRoute()
@Controller('v1/campo')
export class CompanySignupCampoController {
  constructor(private readonly signups: CompanySignupService) {}

  @Get('visits/:ref/company-signup')
  daVisita(@CurrentConsultant() c: CampoConsultant, @Param('ref') ref: string) {
    return this.signups.daVisitaComPrefill(c, ref);
  }

  /** 201 quando criou agora; 200 no reenvio (sem link). */
  @Post('visits/:ref/company-signup')
  async criar(
    @CurrentConsultant() c: CampoConsultant,
    @Param('ref') ref: string,
    @Body() dto: SignupCreateDto,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const v = await this.signups.criar(c, ref, dto);
    void res.status(v.created ? 201 : 200);
    // Resposta com credencial de uso único: nada de cache em aparelho ou proxy.
    void res.header('Cache-Control', 'no-store');
    return v;
  }

  @HttpCode(200)
  @Post('company-signups/:id/reissue-link')
  async reemitir(
    @CurrentConsultant() c: CampoConsultant,
    @Param('id') id: string,
    @Body() dto: ReissueLinkDto,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    void res.header('Cache-Control', 'no-store');
    return this.signups.reemitir(c, id, dto);
  }

  @Get('company-signups/:id')
  buscar(@CurrentConsultant() c: CampoConsultant, @Param('id') id: string) {
    return this.signups.buscar(c, id);
  }
}

/** Leitura da equipe (`/v1/consultores/:id/company-signups`) — contrato §26.4. Sem `@CampoRoute()`. */
@ApiTags('Consultores de campo')
@ApiBearerAuth()
@Controller('v1/consultores')
export class CompanySignupEquipeController {
  constructor(private readonly signups: CompanySignupService) {}

  @Get(':id/company-signups')
  listar(@Param('id') id: string, @Query() q: SignupsQueryDto) {
    return this.signups.listarDoConsultor(id, q);
  }
}
