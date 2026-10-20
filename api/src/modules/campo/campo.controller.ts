import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Optional,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { CampoConsultant } from '../../common/auth/campo-consultant';
import { AllowPendingPassword, CampoRoute } from '../../common/decorators/campo-route.decorator';
import { CurrentConsultant } from '../../common/decorators/current-consultant.decorator';
import { CampoAuthService } from './campo-auth.service';
import { COMPANY_SIGNUP_LIGADO } from './company-signup.tokens';
import { AnswersDto, PlacesQueryDto, PontosDto, PosicaoDto, SimilarQueryDto, StartJourneyDto } from './dto/campo.dto';
import { FollowupsService } from './followups.service';
import { JourneysService } from './journeys.service';
import { lerCheckinMultipart } from './multipart-checkin';
import { PlacesService } from './places.service';
import { VisitsService } from './visits.service';

/** Rotas do dia a dia do consultor (`/v1/campo/*`) — §20 do contrato. */
@ApiTags('Campo')
@ApiBearerAuth()
@CampoRoute()
@Controller('v1/campo')
export class CampoController {
  constructor(
    private readonly auth: CampoAuthService,
    private readonly journeys: JourneysService,
    private readonly places: PlacesService,
    private readonly visits: VisitsService,
    private readonly followups: FollowupsService,
    @Optional() @Inject(COMPANY_SIGNUP_LIGADO) private readonly signupLigado: boolean = false,
  ) {}

  @AllowPendingPassword()
  @Get('me')
  async me(@CurrentConsultant() c: CampoConsultant) {
    // `features` esconde o botão "Cadastrar no Freela" no web quando a flag está desligada (§26.3).
    return { ...(await this.auth.me(c.id)), features: { company_signup: this.signupLigado } };
  }

  @Get('today')
  today(@CurrentConsultant() c: CampoConsultant) {
    return this.journeys.today(c);
  }

  /** Retornos de hoje e atrasados das PRÓPRIAS visitas (§25.4). */
  @Get('followups')
  followupsDoConsultor(@CurrentConsultant() c: CampoConsultant) {
    return this.followups.doConsultor(c);
  }

  // ── jornada ─────────────────────────────────────────────────
  @Post('journeys/start')
  start(@CurrentConsultant() c: CampoConsultant, @Body() dto: StartJourneyDto) {
    return this.journeys.start(c, dto);
  }

  @HttpCode(200)
  @Post('journeys/current/points')
  points(@CurrentConsultant() c: CampoConsultant, @Body() dto: PontosDto) {
    return this.journeys.addPoints(c, dto);
  }

  @HttpCode(200)
  @Post('journeys/current/end')
  end(@CurrentConsultant() c: CampoConsultant, @Body() dto: PosicaoDto) {
    return this.journeys.end(c, dto);
  }

  // ── estabelecimentos (a estática `places/similar` antes de `places`) ──
  @Get('places/similar')
  similar(@CurrentConsultant() c: CampoConsultant, @Query() q: SimilarQueryDto) {
    return this.places.similar(c, q);
  }

  @Get('places')
  listPlaces(@CurrentConsultant() c: CampoConsultant, @Query() q: PlacesQueryDto) {
    return this.places.list(c, q);
  }

  // ── visitas ─────────────────────────────────────────────────
  @Post('visits')
  @ApiConsumes('multipart/form-data')
  async checkin(@CurrentConsultant() c: CampoConsultant, @Req() req: FastifyRequest) {
    const { campos, foto } = await lerCheckinMultipart(req);
    return this.visits.checkin(c, campos, foto);
  }

  @Patch('visits/:ref/answers')
  answers(@CurrentConsultant() c: CampoConsultant, @Param('ref') ref: string, @Body() dto: AnswersDto) {
    return this.visits.saveAnswers(c, ref, dto);
  }

  @HttpCode(200)
  @Post('visits/:ref/checkout')
  checkout(@CurrentConsultant() c: CampoConsultant, @Param('ref') ref: string, @Body() dto: PosicaoDto) {
    return this.visits.checkout(c, ref, dto);
  }

  @Get('visits/:ref/photo')
  async photo(
    @CurrentConsultant() c: CampoConsultant,
    @Param('ref') ref: string,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const f = await this.visits.photo(c, ref);
    // Só no sucesso: erro (404/502/503) não pode ficar 24 h no cache do aparelho.
    void res.header('Cache-Control', 'private, max-age=86400');
    return new StreamableFile(f.bytes, { type: f.mime, disposition: 'inline' });
  }
}
