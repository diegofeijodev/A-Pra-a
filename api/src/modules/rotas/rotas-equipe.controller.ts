import { Body, Controller, Get, HttpCode, Inject, Optional, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../../common/auth/auth-user';
import { AdminOnly } from '../../common/decorators/admin-only.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { LOVABLE_E_FLAGS, type FlagsLovableE } from '../../common/flags/lovable-e.flags';
import { CandidatosQueryDto, ConfigRotaDto, MontarRotaDto, OrdenarRotaDto, ReotimizarEquipeDto, RotasQueryDto } from './dto/rotas.dto';
import { RotasConfigService } from './rotas-config.service';
import { RotasEquipeService } from './rotas-equipe.service';
import {
  LOVABLE_A_FLAGS,
  LOVABLE_B_FLAGS,
  LOVABLE_C_FLAGS,
  LOVABLE_D_FLAGS,
  type FlagsLovableA,
  type FlagsLovableB,
  type FlagsLovableC,
  type FlagsLovableD,
} from './rotas.tokens';

/**
 * Roteiros vistos e montados pela equipe (§23.4). Leitura: equipe. Escrita: só admin.
 * Sem `@CampoRoute()`: o consultor de campo não acessa. Estáticas ANTES de `:id`.
 */
@ApiTags('Roteiros')
@ApiBearerAuth()
@Controller('v1/routes')
export class RotasEquipeController {
  constructor(private readonly rotas: RotasEquipeService) {}

  @Get()
  list(@Query() q: RotasQueryDto) {
    return this.rotas.list(q);
  }

  @Get('candidates')
  candidates(@Query() q: CandidatosQueryDto) {
    return this.rotas.candidates(q);
  }

  @AdminOnly()
  @Post()
  build(@CurrentUser() user: AuthUser, @Body() dto: MontarRotaDto) {
    return this.rotas.build(dto, user);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.rotas.get(id);
  }

  @AdminOnly()
  @Put(':id/order')
  order(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: OrdenarRotaDto) {
    return this.rotas.order(id, dto, user);
  }

  @AdminOnly()
  @HttpCode(200)
  @Post(':id/reoptimize')
  reoptimize(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ReotimizarEquipeDto) {
    return this.rotas.reoptimize(id, dto, user);
  }
}

/** Parâmetros do roteiro (§23.1). Leitura: equipe. Escrita: só admin. */
@ApiTags('Roteiros')
@ApiBearerAuth()
@Controller('v1/consultores/settings')
export class RotasConfigController {
  constructor(
    private readonly config: RotasConfigService,
    @Optional() @Inject(LOVABLE_A_FLAGS) private readonly flags?: FlagsLovableA,
    @Optional() @Inject(LOVABLE_B_FLAGS) private readonly flagsB?: FlagsLovableB,
    @Optional() @Inject(LOVABLE_C_FLAGS) private readonly flagsC?: FlagsLovableC,
    @Optional() @Inject(LOVABLE_D_FLAGS) private readonly flagsD?: FlagsLovableD,
    @Optional() @Inject(LOVABLE_E_FLAGS) private readonly flagsE?: FlagsLovableE,
  ) {}

  /** `features` (contrato §33.1): o web mostra os links novos sem sondar rota desligada. Só no GET. */
  @Get('config')
  async get() {
    return {
      ...(await this.config.view()),
      features: {
        dashboard: this.flags?.dashboard ?? false,
        day_summary: this.flags?.day_summary ?? false,
        map_pins: this.flags?.map_pins ?? false,
        // Lote B (contrato §35.6, §37.6).
        checklist: this.flagsB?.checklist ?? false,
        breaks: this.flagsB?.breaks ?? false,
        // Lote C (contrato §36, §38.1).
        segments: this.flagsC?.segments ?? false,
        vouchers: this.flagsC?.vouchers ?? false,
        voucher_coupons: this.flagsC?.voucher_coupons ?? false,
        // Lote D (contrato §39, §40).
        route_plans: this.flagsD?.route_plans ?? false,
        malls: this.flagsD?.malls ?? false,
        // Lote E (contrato §41.1, §42.1).
        password_policy: this.flagsE?.password_policy ?? false,
        consultant_profile: this.flagsE?.consultant_profile ?? false,
        contact_email: this.flagsE?.contact_email ?? false,
        team_gestor: this.flagsE?.team_gestor ?? false,
      },
    };
  }

  @AdminOnly()
  @Put('config')
  put(@CurrentUser() user: AuthUser, @Body() dto: ConfigRotaDto) {
    return this.config.atualizar(dto, user);
  }
}
