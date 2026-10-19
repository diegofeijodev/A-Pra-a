import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../../common/auth/auth-user';
import { AdminOnly } from '../../common/decorators/admin-only.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CandidatosQueryDto, ConfigRotaDto, MontarRotaDto, OrdenarRotaDto, ReotimizarEquipeDto, RotasQueryDto } from './dto/rotas.dto';
import { RotasConfigService } from './rotas-config.service';
import { RotasEquipeService } from './rotas-equipe.service';

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
  constructor(private readonly config: RotasConfigService) {}

  @Get('config')
  get() {
    return this.config.view();
  }

  @AdminOnly()
  @Put('config')
  put(@CurrentUser() user: AuthUser, @Body() dto: ConfigRotaDto) {
    return this.config.atualizar(dto, user);
  }
}
