import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminOnly } from '../../common/decorators/admin-only.decorator';
import { ActionsService } from './actions.service';
import { CreateTemplateActionDto, UpdateTemplateActionDto } from './dto/actions.dto';

// Roteiro-modelo (playbook) — a lista que vira as ações de cada praça nova.
// Leitura para o time todo; escrita só para admin (mexer aqui muda toda praça
// aberta daqui em diante).
@ApiTags('Roteiro-modelo')
@ApiBearerAuth()
@Controller('v1/template-actions')
export class TemplateActionsController {
  constructor(private readonly actions: ActionsService) {}

  @Get()
  list() {
    return this.actions.listTemplates();
  }

  @AdminOnly()
  @Post()
  create(@Body() dto: CreateTemplateActionDto) {
    return this.actions.createTemplate(dto);
  }

  @AdminOnly()
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTemplateActionDto) {
    return this.actions.updateTemplate(id, dto);
  }

  @AdminOnly()
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.actions.removeTemplate(id);
  }
}
