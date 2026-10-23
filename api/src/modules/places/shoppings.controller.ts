import { Body, Controller, Get, Param, Patch, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../../common/auth/auth-user';
import { AdminOnly, GestorOuAdmin } from '../../common/decorators/admin-only.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ConfigShoppingDto, MarcarShoppingDto, ShoppingsQueryDto, ShoppingsService } from './shoppings.service';

/**
 * Shoppings da praça (contrato §40.4). Leitura: equipe. Escrita: só admin. Sem `@CampoRoute()`. Estáticas antes de `:lead_id`.
 * `404 MALLS_DISABLED` com a flag desligada.
 */
@ApiTags('Shoppings')
@ApiBearerAuth()
@Controller('v1/consultores/shoppings')
export class ShoppingsController {
  constructor(private readonly shoppings: ShoppingsService) {}

  @Get('config')
  config() {
    return this.shoppings.config();
  }

  @AdminOnly()
  @Put('config')
  salvarConfig(@Body() dto: ConfigShoppingDto) {
    return this.shoppings.salvarConfig(dto);
  }

  @Get()
  list(@Query() q: ShoppingsQueryDto) {
    return this.shoppings.list(q);
  }

  @GestorOuAdmin()
  @Patch(':lead_id')
  marcar(@CurrentUser() user: AuthUser, @Param('lead_id') leadId: string, @Body() dto: MarcarShoppingDto) {
    return this.shoppings.marcar(leadId, dto, user);
  }
}
