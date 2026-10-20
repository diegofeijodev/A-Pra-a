import { Body, Controller, Get, NotFoundException, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../../../common/auth/auth-user';
import { AdminOnly } from '../../../common/decorators/admin-only.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { isUuid } from '../../../common/ids/uuid';
import { DeclaredLigadoGuard } from './declared.guard';
import { DeclaredSignupsService } from './declared-signups.service';
import { AnularDeclaracaoDto, DeclaredQueryDto } from './dto/declared.dto';

/**
 * Cadastros declarados — equipe (contrato §32.6). Leitura: equipe. Anulação: só admin. Sem `@CampoRoute()`: o consultor
 * de campo não acessa (token de campo = 401). Declarado ANTES do `:id` de `/v1/consultores`.
 */
@ApiTags('Cadastros declarados')
@ApiBearerAuth()
@UseGuards(DeclaredLigadoGuard)
@Controller('v1/consultores/declared-signups')
export class DeclaredSignupsEquipeController {
  constructor(private readonly declared: DeclaredSignupsService) {}

  @Get()
  relatorio(@Query() q: DeclaredQueryDto) {
    return this.declared.relatorio(q);
  }

  @AdminOnly()
  @Post(':id/void')
  anular(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AnularDeclaracaoDto) {
    if (!isUuid(id)) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Declaração não encontrada.' });
    return this.declared.anular(id, dto, user);
  }
}
