import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../../common/auth/auth-user';
import { AdminOnly, Equipe } from '../../common/decorators/admin-only.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AgendaService } from './agenda.service';
import {
  AgendaQueryDto,
  CreatePracaDto,
  StepResultDto,
  StepUnlockDto,
  UpdatePracaDto,
} from './dto/pracas.dto';
import { PracasService } from './pracas.service';

@ApiTags('Praças')
@ApiBearerAuth()
@Controller('v1/pracas')
export class PracasController {
  constructor(
    private readonly pracas: PracasService,
    private readonly agenda: AgendaService,
  ) {}

  @Get()
  list() {
    return this.pracas.list();
  }

  @Equipe()
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePracaDto) {
    return this.pracas.create(dto, user);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.pracas.get(id);
  }

  @Equipe()
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePracaDto) {
    return this.pracas.update(id, dto);
  }

  // Apaga a praça inteira (ações, subitens, comentários, conclusões) — só admin.
  @AdminOnly()
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.pracas.remove(id);
  }

  @Equipe()
  @Post(':id/recalc-dates')
  recalcDates(@Param('id') id: string) {
    return this.pracas.recalcDates(id);
  }

  @Get(':id/steps')
  steps(@Param('id') id: string) {
    return this.pracas.steps(id);
  }

  @Equipe()
  @Put(':id/steps/:n/result')
  setStepResult(@Param('id') id: string, @Param('n') n: string, @Body() dto: StepResultDto) {
    return this.pracas.setStepResult(id, n, dto);
  }

  @Equipe()
  @Post(':id/steps/:n/unlock')
  unlockStep(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('n') n: string,
    @Body() dto: StepUnlockDto,
  ) {
    return this.pracas.unlockStep(id, n, dto, user);
  }

  @Get(':id/agenda')
  agendaDaPraca(@Param('id') id: string, @Query() query: AgendaQueryDto) {
    return this.agenda.agenda(id, query);
  }
}
