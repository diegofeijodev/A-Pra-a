import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../../common/auth/auth-user';
import { AdminOnly } from '../../common/decorators/admin-only.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { DisparosService } from './disparos.service';
import { CreateDisparoDto, PreviewDisparoDto } from './dto/disparos.dto';

@ApiTags('Disparos')
@ApiBearerAuth()
@Controller('v1/disparos')
export class DisparosController {
  constructor(private readonly disparos: DisparosService) {}

  @Get()
  list() {
    return this.disparos.list();
  }

  // Rota estática antes das de ':id' — a ordem importa (CLAUDE.md).
  @Post('preview')
  preview(@CurrentUser() user: AuthUser, @Body() dto: PreviewDisparoDto) {
    return this.disparos.preview(dto, user);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateDisparoDto) {
    return this.disparos.create(dto, user);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.disparos.get(id);
  }

  // Só admin: apagar leva a fila inteira do lote (cascata em `msg_sends`).
  @Delete(':id')
  @AdminOnly()
  remove(@Param('id') id: string) {
    return this.disparos.remove(id);
  }
}
