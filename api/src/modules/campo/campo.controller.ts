import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
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
import {
  AnswersDto,
  PlacesQueryDto,
  PontosDto,
  PosicaoDto,
  SimilarQueryDto,
  PainelCampoQueryDto,
  StartJourneyDto,
  VagaDaVisitaDto,
} from './dto/campo.dto';
import { PainelService } from './painel.service';
import { JourneysService } from './journeys.service';
import { lerCheckinMultipart } from './multipart-checkin';
import { PlacesService } from './places.service';
import { RoutesService } from './routes.service';
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
    private readonly routes: RoutesService,
    private readonly painel: PainelService,
  ) {}

  @AllowPendingPassword()
  @Get('me')
  me(@CurrentConsultant() c: CampoConsultant) {
    return this.auth.me(c.id);
  }

  @Get('today')
  today(@CurrentConsultant() c: CampoConsultant) {
    return this.journeys.today(c);
  }

  // ── rota (§21.5) ────────────────────────────────────────────
  @Get('routes/today')
  routeToday(@CurrentConsultant() c: CampoConsultant) {
    return this.routes.today(c);
  }

  @Get('routes/week')
  routeWeek(@CurrentConsultant() c: CampoConsultant) {
    return this.routes.week(c);
  }

  @Get('painel')
  meusNumeros(@CurrentConsultant() c: CampoConsultant, @Query() q: PainelCampoQueryDto) {
    return this.painel.campo(c, (q.periodo as 'dia' | 'semana' | '30d' | undefined) ?? 'dia');
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

  // ── vagas e voucher da visita (§21.6–21.7) ──
  @Post('visits/:ref/vagas')
  addVaga(@CurrentConsultant() c: CampoConsultant, @Param('ref') ref: string, @Body() dto: VagaDaVisitaDto) {
    return this.visits.addVaga(c, ref, dto);
  }

  @HttpCode(200)
  @Delete('visits/:ref/vagas/:vagaId')
  removeVaga(@CurrentConsultant() c: CampoConsultant, @Param('ref') ref: string, @Param('vagaId') vagaId: string) {
    return this.visits.removeVaga(c, ref, vagaId);
  }

  @Post('visits/:ref/voucher')
  voucher(@CurrentConsultant() c: CampoConsultant, @Param('ref') ref: string) {
    return this.visits.requestVoucher(c, ref);
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
