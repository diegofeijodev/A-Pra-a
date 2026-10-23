import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { EvaluateImportDto, RunImportDto, SaveMappingDto } from './dto/imports.dto';
import { ImportsService } from './imports.service';
import { Equipe } from '../../common/decorators/admin-only.decorator';

@ApiTags('Entrada de leads')
@ApiBearerAuth()
@Controller('v1/imports')
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  @Get()
  list() {
    return this.imports.listBatches();
  }

  // Rotas estáticas antes das de ':id' — a ordem importa (CLAUDE.md).
  @Equipe()
  @Post('evaluate')
  evaluate(@Body() dto: EvaluateImportDto) {
    return this.imports.evaluate(dto);
  }

  @Equipe()
  @Post('run')
  run(@Body() dto: RunImportDto, @CurrentUser() user: AuthUser) {
    return this.imports.run(dto, user);
  }

  @Get('mappings')
  listMappings() {
    return this.imports.listMappings();
  }

  @Equipe()
  @Post('mappings')
  saveMapping(@Body() dto: SaveMappingDto) {
    return this.imports.saveMapping(dto);
  }

  @Equipe()
  @Delete('mappings/:id')
  deleteMapping(@Param('id') id: string) {
    return this.imports.deleteMapping(id);
  }

  /**
   * Sem `@AdminOnly()` de propósito: no protótipo "desfazer importação" é um
   * botão da tela de Entrada, usado por quem acabou de importar (vendedor, não
   * admin). Ele só apaga leads DAQUELE lote que ninguém tocou, dentro de 24 h
   * — não é o mesmo que o `DELETE /v1/leads/:id`, que apaga um lead qualquer
   * com histórico e por isso é ferramenta de limpeza do admin.
   */
  @Equipe()
  @Post(':id/undo')
  undo(@Param('id') id: string) {
    return this.imports.undo(id);
  }
}
