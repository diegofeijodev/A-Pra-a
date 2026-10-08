import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../../common/auth/auth-user';
import { AdminOnly } from '../../common/decorators/admin-only.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ConsultoresService } from './consultores.service';
import { CreateConsultorDto, UpdateConsultorDto } from './dto/consultores.dto';

/**
 * Telas da equipe sobre os consultores de campo (`/v1/consultores`, §20.4).
 * Leitura: qualquer pessoa da equipe. Escrita: só admin — a mesma regra do
 * cadastro de pessoas. Rotas estáticas ANTES das de `:id` (CLAUDE.md).
 */
@ApiTags('Consultores de campo')
@ApiBearerAuth()
@Controller('v1/consultores')
export class ConsultoresController {
  constructor(private readonly consultores: ConsultoresService) {}

  @Get()
  list() {
    return this.consultores.list();
  }

  @AdminOnly()
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateConsultorDto) {
    return this.consultores.create(dto, user);
  }

  // ── rotas com :id (as estáticas da Task 7 entram ACIMA desta linha) ──
  @Get(':id')
  get(@Param('id') id: string) {
    return this.consultores.get(id);
  }

  @AdminOnly()
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateConsultorDto) {
    return this.consultores.update(id, dto);
  }

  @AdminOnly()
  @HttpCode(200)
  @Post(':id/reset-password')
  resetPassword(@Param('id') id: string) {
    return this.consultores.resetPassword(id);
  }

  @AdminOnly()
  @HttpCode(200)
  @Post(':id/freela-sync')
  freelaSync(@Param('id') id: string) {
    return this.consultores.freelaSync(id);
  }

  @AdminOnly()
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.consultores.remove(id);
  }
}
