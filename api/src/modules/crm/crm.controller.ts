import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../../common/auth/auth-user';
import { Equipe } from '../../common/decorators/admin-only.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CrmLigadoGuard } from './crm.guard';
import { TarefaFeitaDto, TarefasQueryDto } from './dto/crm.dto';
import { TarefasService } from './tarefas.service';

/** Tarefas do dia do Comercial (contrato §47.3). Só rotas estáticas; `@Equipe()` em cada método. */
@ApiTags('CRM automático')
@ApiBearerAuth()
@UseGuards(CrmLigadoGuard)
@Controller('v1/crm')
export class CrmController {
  constructor(private readonly tarefas: TarefasService) {}

  @Equipe()
  @Get('tasks')
  listar(@CurrentUser() user: AuthUser, @Query() q: TarefasQueryDto) {
    return this.tarefas.listar(q.praca_id, q.person ?? 'all', user.id);
  }

  @Equipe()
  @Post('tasks/done')
  feita(@CurrentUser() user: AuthUser, @Body() dto: TarefaFeitaDto) {
    return this.tarefas.concluir(dto, user);
  }
}
