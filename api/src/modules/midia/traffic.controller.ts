import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TrafficBodyDto, TrafficDayDto, TrafficQueryDto } from './dto/midia.dto';
import { MidiaService } from './midia.service';

@ApiTags('Tráfego pago')
@ApiBearerAuth()
@Controller('v1/traffic')
export class TrafficController {
  constructor(private readonly midia: MidiaService) {}

  @Get()
  list(@Query() query: TrafficQueryDto) {
    return this.midia.listTraffic(query.campanha_id);
  }

  @Post()
  create(@Body() dto: TrafficBodyDto) {
    return this.midia.createTraffic(dto);
  }

  @Put(':id')
  replace(@Param('id') id: string, @Body() dto: TrafficBodyDto) {
    return this.midia.replaceTraffic(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.midia.removeTraffic(id);
  }

  // Um lançamento por dia: mandar a mesma data duas vezes CORRIGE a linha, não
  // cria outra (`traffic_days` é único em entry_id + date).
  @Put(':id/days')
  upsertDay(@Param('id') id: string, @Body() dto: TrafficDayDto) {
    return this.midia.upsertDay(id, dto);
  }

  @Post(':id/pull-api')
  pullApi(@Param('id') id: string) {
    return this.midia.pullApi(id);
  }
}
