import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { EvaluateImportDto, RunImportDto, SaveMappingDto } from './dto/imports.dto';
import { ImportsService } from './imports.service';

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
  @Post('evaluate')
  evaluate(@Body() dto: EvaluateImportDto) {
    return this.imports.evaluate(dto);
  }

  @Post('run')
  run(@Body() dto: RunImportDto, @CurrentUser() user: AuthUser) {
    return this.imports.run(dto, user);
  }

  @Get('mappings')
  listMappings() {
    return this.imports.listMappings();
  }

  @Post('mappings')
  saveMapping(@Body() dto: SaveMappingDto) {
    return this.imports.saveMapping(dto);
  }

  @Delete('mappings/:id')
  deleteMapping(@Param('id') id: string) {
    return this.imports.deleteMapping(id);
  }

  @Post(':id/undo')
  undo(@Param('id') id: string) {
    return this.imports.undo(id);
  }
}
