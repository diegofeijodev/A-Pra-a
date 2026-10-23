import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RenderTemplateDto, TemplateBodyDto } from './dto/messages.dto';
import { MessagesService } from './messages.service';
import { Equipe } from '../../common/decorators/admin-only.decorator';

@ApiTags('Modelos de mensagem')
@ApiBearerAuth()
@Controller('v1/msg-templates')
export class TemplatesController {
  constructor(private readonly messages: MessagesService) {}

  @Get()
  list() {
    return this.messages.listTemplates();
  }

  // Rota estática antes das de ':id' — a ordem importa (CLAUDE.md).
  @Equipe()
  @Post('render')
  render(@CurrentUser() user: AuthUser, @Body() dto: RenderTemplateDto) {
    return this.messages.render(dto, user);
  }

  @Equipe()
  @Post()
  create(@Body() dto: TemplateBodyDto) {
    return this.messages.createTemplate(dto);
  }

  @Equipe()
  @Put(':id')
  replace(@Param('id') id: string, @Body() dto: TemplateBodyDto) {
    return this.messages.replaceTemplate(id, dto);
  }

  @Equipe()
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.messages.removeTemplate(id);
  }
}
