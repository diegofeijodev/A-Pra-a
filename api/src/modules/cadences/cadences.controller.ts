import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CadencesService } from './cadences.service';
import {
  CadenceBodyDto,
  EnrollLeadDto,
  EnrollmentsQueryDto,
  ExitEnrollmentDto,
  TestCadenceDto,
} from './dto/cadences.dto';
import { Equipe } from '../../common/decorators/admin-only.decorator';

@ApiTags('Cadências')
@ApiBearerAuth()
@Controller('v1/cadences')
export class CadencesController {
  constructor(private readonly cadences: CadencesService) {}

  @Get()
  list() {
    return this.cadences.list();
  }

  @Equipe()
  @Post()
  create(@Body() dto: CadenceBodyDto) {
    return this.cadences.create(dto);
  }

  // Rota estática antes das de ':id' — a ordem importa (CLAUDE.md).
  @Equipe()
  @Post('restore-seed')
  restoreSeed() {
    return this.cadences.restoreSeed();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.cadences.get(id);
  }

  @Get(':id/stats')
  stats(@Param('id') id: string) {
    return this.cadences.stats(id);
  }

  @Equipe()
  @Put(':id')
  replace(@Param('id') id: string, @Body() dto: CadenceBodyDto) {
    return this.cadences.replace(id, dto);
  }

  // Sem `@AdminOnly()`: no protótipo qualquer pessoa do time apaga a cadência
  // que ela mesma montou. O histórico do que já foi enviado (`msg_sends`) fica.
  @Equipe()
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.cadences.remove(id);
  }

  @Equipe()
  @Post(':id/toggle-pause')
  togglePause(@Param('id') id: string) {
    return this.cadences.togglePause(id);
  }

  @Equipe()
  @Post(':id/enroll')
  enroll(@Param('id') id: string, @Body() dto: EnrollLeadDto) {
    return this.cadences.enroll(id, dto);
  }

  @Equipe()
  @Post(':id/test')
  test(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: TestCadenceDto) {
    return this.cadences.test(id, dto, user);
  }
}

// Inscrição é a unidade que a tela do lead também mostra ("está na cadência X,
// passo 2"), por isso vive numa rota própria e não embaixo de `/v1/cadences`.
@ApiTags('Inscrições em cadência')
@ApiBearerAuth()
@Controller('v1/enrollments')
export class EnrollmentsController {
  constructor(private readonly cadences: CadencesService) {}

  @Get()
  list(@Query() query: EnrollmentsQueryDto) {
    return this.cadences.listEnrollments(query);
  }

  @Equipe()
  @Post(':id/exit')
  exit(@Param('id') id: string, @Body() dto: ExitEnrollmentDto) {
    return this.cadences.exitEnrollment(id, dto);
  }
}
