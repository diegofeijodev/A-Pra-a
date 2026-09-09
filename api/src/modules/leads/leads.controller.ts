import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../../common/auth/auth-user';
import { AdminOnly } from '../../common/decorators/admin-only.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  CreateLeadDto,
  CreateLeadEventDto,
  CreateLeadVagaDto,
  LeadsMetricsQueryDto,
  ListLeadsQueryDto,
  MoveLeadDto,
  NextStepDto,
  QueueQueryDto,
  SnoozeLeadDto,
  UpdateLeadDto,
} from './dto/leads.dto';
import { LeadsService } from './leads.service';
import { QueueService } from './queue.service';

@ApiTags('Funil de leads')
@ApiBearerAuth()
@Controller('v1/leads')
export class LeadsController {
  constructor(
    private readonly leads: LeadsService,
    private readonly fila: QueueService,
  ) {}

  @Get()
  list(@Query() query: ListLeadsQueryDto) {
    return this.leads.list(query);
  }

  @Post()
  create(@Body() dto: CreateLeadDto) {
    return this.leads.create(dto);
  }

  // Rotas estáticas antes das de ':id' — a ordem importa (CLAUDE.md).
  @Get('queue')
  queue(@Query() query: QueueQueryDto) {
    return this.fila.queue(query);
  }

  @Get('metrics')
  metrics(@Query() query: LeadsMetricsQueryDto) {
    return this.leads.metrics(query);
  }

  @Get('orphans')
  orphans() {
    return this.leads.orphans();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.leads.get(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateLeadDto) {
    return this.leads.update(id, dto);
  }

  @Post(':id/move')
  move(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: MoveLeadDto) {
    return this.leads.move(id, dto, user);
  }

  @Post(':id/events')
  addEvent(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CreateLeadEventDto) {
    return this.leads.addEvent(id, dto, user);
  }

  @Put(':id/next-step')
  setNextStep(@Param('id') id: string, @Body() dto: NextStepDto) {
    return this.leads.setNextStep(id, dto);
  }

  @Post(':id/archive')
  archive(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.leads.archive(id, user);
  }

  @Post(':id/snooze')
  snooze(@Param('id') id: string, @Body() dto: SnoozeLeadDto) {
    return this.leads.snooze(id, dto);
  }

  @Post(':id/vagas')
  addVaga(@Param('id') id: string, @Body() dto: CreateLeadVagaDto) {
    return this.leads.addVaga(id, dto);
  }

  // Arquivar é o caminho normal; apagar de vez é limpeza de admin.
  @AdminOnly()
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.leads.remove(id);
  }
}
