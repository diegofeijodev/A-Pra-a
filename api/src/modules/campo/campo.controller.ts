import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
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
import { ModoCampoService } from '../rotas/modo-campo.service';
import { RotasConfigService } from '../rotas/rotas-config.service';
import { LOVABLE_A_FLAGS, LOVABLE_B_FLAGS, LOVABLE_C_FLAGS, type FlagsLovableA, type FlagsLovableB, type FlagsLovableC } from '../rotas/rotas.tokens';
import { VouchersService } from './vouchers/vouchers.service';
import { CampoAuthService } from './campo-auth.service';
import { COMPANY_SIGNUP_LIGADO } from './company-signup.tokens';
import { BreaksService } from './breaks.service';
import { AnswersDto, IntervaloDto, PlacesQueryDto, PontosDto, PosicaoDto, SimilarQueryDto, StartJourneyDto } from './dto/campo.dto';
import { FollowupsService } from './followups.service';
import { JourneysService } from './journeys.service';
import { lerCheckinMultipart } from './multipart-checkin';
import { EARNINGS_OPCOES, type OpcoesEarnings } from './earnings/earnings.tokens';
import { PAYOUTS_OPCOES, type OpcoesPayouts } from './payouts/payouts.tokens';
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
    @Optional() @Inject(EARNINGS_OPCOES) private readonly earnings?: OpcoesEarnings,
    @Optional() @Inject(PAYOUTS_OPCOES) private readonly payouts?: OpcoesPayouts,
    @Optional() private readonly modo?: ModoCampoService,
    @Optional() @Inject(LOVABLE_A_FLAGS) private readonly lovable?: FlagsLovableA,
    @Optional() @Inject(LOVABLE_B_FLAGS) private readonly lovB?: FlagsLovableB,
    @Optional() private readonly configs?: RotasConfigService,
    @Optional() private readonly breaks?: BreaksService,
    @Optional() @Inject(LOVABLE_C_FLAGS) private readonly lovC?: FlagsLovableC,
    @Optional() private readonly vouchers?: VouchersService,
  ) {}

  @AllowPendingPassword()
  @Get('me')
  async me(@CurrentConsultant() c: CampoConsultant) {
    // `features` esconde o botão "Cadastrar no Freela" no web quando a flag está desligada (§26.3).
    // Contrato §31.4: `visit_flow` = o fluxo que vale agora para ele; `visit_config` só com a flag ligada (a tela confere o que
    // falta sem sinal; quem decide é o servidor).
    const ligado = this.modo?.ligado ?? false;
    const visit_flow = this.modo ? await this.modo.fluxoDoConsultor(c.id) : 'completo';
    const cfg = ligado && this.modo ? await this.modo.config() : null;
    // Lote B (contrato §35.6/§37.6): a lista do checklist e o intervalo para a tela funcionar sem sinal; só com a flag ligada.
    const ck = this.lovB?.checklist && this.configs ? await this.configs.checklist() : null;
    const iv = this.lovB?.breaks && this.configs ? await this.configs.intervalo() : null;
    // Lote C (contrato §38.1): o desconto e a validade para a tela de pedir escrever a frase sem sinal; só com a flag ligada.
    const vc = this.lovC?.vouchers && this.vouchers ? await this.vouchers.config() : null;
    return {
      ...(await this.auth.me(c.id)),
      visit_flow,
      ...(cfg
        ? {
            visit_config: {
              justificativa_distancia: cfg.justificativa_distancia,
              contato_obrigatorio_em: cfg.contato_obrigatorio_em,
              contato_campos: cfg.contato_campos,
              fechado_conta_na_meta: cfg.fechado_conta_na_meta,
              desfazer_segundos: cfg.desfazer_segundos,
            },
          }
        : {}),
      ...(ck
        ? {
            checklist_config: {
              items: ck.checklist_items,
              obrigatorio: ck.checklist_obrigatorio,
              fluxos: ck.checklist_fluxos,
              aberto: ck.checklist_aberto,
            },
          }
        : {}),
      ...(iv ? { breaks_config: { intervalo_ativo: iv.intervalo_ativo, intervalo_lembrete_min: iv.intervalo_lembrete_min } } : {}),
      ...(vc
        ? {
            voucher_config: {
              discount_type: vc.discount_type,
              percent_off: vc.discount_type === 'PERCENT' ? vc.percent_off : null,
              amount_off_cents: vc.discount_type === 'FIXED' ? vc.amount_off_cents : null,
              single_use: vc.single_use,
              validade_dias: vc.validade_dias,
              min_job_hours: vc.min_job_hours,
              coupons: this.lovC?.voucher_coupons ?? false,
            },
          }
        : {}),
      features: {
        company_signup: this.signupLigado,
        earnings: this.earnings?.ligado ?? false,
        payouts: this.payouts?.ligado ?? false,
        visit_flow: ligado,
        declared_signups: this.earnings?.declaradasLigado ?? false,
        // Restante da Lovable, lote A (contrato §33.1): resumo do dia e mapa de pinos.
        day_summary: this.lovable?.day_summary ?? false,
        map_pins: this.lovable?.map_pins ?? false,
        // Lote B (contrato §35.6, §37.6): checklist da visita e intervalo.
        checklist: this.lovB?.checklist ?? false,
        breaks: this.lovB?.breaks ?? false,
        // Lote C (contrato §38.1): pedido de cupom da 1ª contratação.
        vouchers: this.lovC?.vouchers ?? false,
      },
    };
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

  // ── intervalo (lote B, contrato §37.4) ─────────────────────
  @Post('journeys/current/breaks/start')
  breakStart(@CurrentConsultant() c: CampoConsultant, @Body() dto: IntervaloDto) {
    if (!this.breaks) throw new NotFoundException({ code: 'BREAKS_DISABLED', message: 'O intervalo não está ligado neste servidor.' });
    return this.breaks.start(c, dto);
  }

  @HttpCode(200)
  @Post('journeys/current/breaks/end')
  breakEnd(@CurrentConsultant() c: CampoConsultant, @Body() dto: IntervaloDto) {
    if (!this.breaks) throw new NotFoundException({ code: 'BREAKS_DISABLED', message: 'O intervalo não está ligado neste servidor.' });
    return this.breaks.end(c, dto);
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

  /** Cancelar a visita aberta feita por engano (contrato §31.7). */
  @HttpCode(200)
  @Delete('visits/:ref')
  cancel(@CurrentConsultant() c: CampoConsultant, @Param('ref') ref: string) {
    return this.visits.cancel(c, ref);
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
