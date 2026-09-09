import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  CampanhaBodyDto,
  CampanhaStatusDto,
  CampanhasQueryDto,
  DuplicateCampanhaDto,
  PracaQueryDto,
  SuggestNameDto,
} from './dto/midia.dto';
import { MidiaService } from './midia.service';

@ApiTags('Campanhas de mídia')
@ApiBearerAuth()
@Controller('v1/campanhas')
export class CampanhasController {
  constructor(private readonly midia: MidiaService) {}

  @Get()
  list(@Query() query: CampanhasQueryDto) {
    return this.midia.listCampanhas(query);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CampanhaBodyDto) {
    return this.midia.createCampanha(dto, user);
  }

  // Rotas estáticas ANTES das de ':id' — a ordem importa (CLAUDE.md).
  @Post('suggest-name')
  suggestName(@Body() dto: SuggestNameDto) {
    return this.midia.suggestName(dto);
  }

  /** Freio automático de mídia: preenchimento médio da praça e o teto de 4 h. */
  @Get('fill-hours')
  fillHours(@Query() query: PracaQueryDto) {
    return this.midia.fillBrake(query.praca_id);
  }

  @Put(':id')
  replace(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CampanhaBodyDto) {
    return this.midia.replaceCampanha(id, dto, user);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.midia.removeCampanha(id);
  }

  @Post(':id/duplicate')
  duplicate(@Param('id') id: string, @Body() dto: DuplicateCampanhaDto) {
    return this.midia.duplicateCampanha(id, dto);
  }

  @Post(':id/status')
  setStatus(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CampanhaStatusDto) {
    return this.midia.setCampanhaStatus(id, dto, user);
  }
}
