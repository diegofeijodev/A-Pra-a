import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../../../common/auth/auth-user';
import { CampoConsultant } from '../../../common/auth/campo-consultant';
import { AdminOnly } from '../../../common/decorators/admin-only.decorator';
import { CampoRoute } from '../../../common/decorators/campo-route.decorator';
import { CurrentConsultant } from '../../../common/decorators/current-consultant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { AtribuirItemDto, ConfigDivisaoDto, CriarPlanoDto, MinhasRotasQueryDto, PlanosQueryDto, PreviaPlanoDto } from './planos.dto';
import { PlanosService } from './planos.service';

/**
 * Divisão de uma área em N rotas (contrato §39.5). Leitura: equipe. Escrita: só admin. Sem `@CampoRoute()`: o consultor não
 * acessa. Estáticas ANTES de `:id`. `404 ROUTE_PLANS_DISABLED` com a flag desligada.
 */
@ApiTags('Roteiros — planos')
@ApiBearerAuth()
@Controller('v1/route-plans')
export class PlanosController {
  constructor(private readonly planos: PlanosService) {}

  @Get('config')
  config() {
    return this.planos.config();
  }

  @AdminOnly()
  @Put('config')
  salvarConfig(@Body() dto: ConfigDivisaoDto) {
    return this.planos.salvarConfig(dto);
  }

  @Get('preview')
  previa(@Query() q: PreviaPlanoDto) {
    return this.planos.previa(q);
  }

  @Get()
  list(@Query() q: PlanosQueryDto) {
    return this.planos.list(q);
  }

  @AdminOnly()
  @Post()
  criar(@CurrentUser() user: AuthUser, @Body() dto: CriarPlanoDto) {
    return this.planos.criar(dto, user);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.planos.get(id);
  }

  @AdminOnly()
  @HttpCode(200)
  @Post(':id/items/:itemId/assign')
  atribuir(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('itemId') itemId: string, @Body() dto: AtribuirItemDto) {
    return this.planos.atribuir(id, itemId, dto, user);
  }

  @AdminOnly()
  @HttpCode(200)
  @Post(':id/archive')
  arquivar(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.planos.arquivar(id, user);
  }
}

/** "Minhas rotas" / "Próximos dias" do consultor (contrato §39.7): só leitura e só as dele. */
@ApiTags('Campo — roteiro')
@ApiBearerAuth()
@CampoRoute()
@Controller('v1/campo/routes')
export class MinhasRotasController {
  constructor(private readonly planos: PlanosService) {}

  @Get()
  minhas(@CurrentConsultant() c: CampoConsultant, @Query() q: MinhasRotasQueryDto) {
    return this.planos.minhasRotas(c.id, q);
  }
}
