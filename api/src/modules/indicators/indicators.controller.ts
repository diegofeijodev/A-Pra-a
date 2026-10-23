import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  CanaisQueryDto,
  EntryKeyQueryDto,
  IndicatorEntryDto,
  PeriodQueryDto,
  ReadingsQueryDto,
} from './dto/indicators.dto';
import { IndicatorsService } from './indicators.service';
import { Equipe } from '../../common/decorators/admin-only.decorator';

@ApiTags('Indicadores')
@ApiBearerAuth()
@Controller('v1/indicators')
export class IndicatorsController {
  constructor(private readonly indicators: IndicatorsService) {}

  @Get()
  readings(@Query() query: ReadingsQueryDto) {
    return this.indicators.readings(query);
  }

  // Rotas estáticas ANTES da de ':key' — a ordem importa (CLAUDE.md).
  @Get('empresa')
  empresa(@Query() query: PeriodQueryDto) {
    return this.indicators.empresa(query);
  }

  @Get('pracas')
  pracas(@Query() query: PeriodQueryDto) {
    return this.indicators.pracas(query);
  }

  @Get('pessoas')
  pessoas(@Query() query: PeriodQueryDto) {
    return this.indicators.pessoas(query);
  }

  @Get('canais')
  canais(@Query() query: CanaisQueryDto) {
    return this.indicators.canais(query);
  }

  @Equipe()
  @Post(':key/entries')
  putEntry(@Param('key') key: string, @Body() dto: IndicatorEntryDto) {
    return this.indicators.putEntry(key, dto);
  }

  @Equipe()
  @Delete(':key/entries')
  removeEntry(@Param('key') key: string, @Query() query: EntryKeyQueryDto) {
    return this.indicators.removeEntry(key, query);
  }
}
