import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { AuthUser } from '../../common/auth/auth-user';
import { AdminOnly } from '../../common/decorators/admin-only.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AtencaoService } from './atencao.service';
import { ConsultoresService } from './consultores.service';
import { FollowupsService } from './followups.service';
import { PracaOpcionalQueryDto } from './dto/atencao.dto';
import { HeatmapQueryDto } from './dto/heatmap.dto';
import { HeatmapService } from './heatmap.service';
import { ChannelsDto, CreateConsultorDto, UpdateConsultorDto } from './dto/consultores.dto';

/**
 * Telas da equipe sobre os consultores de campo (`/v1/consultores`, §20.4).
 * Leitura: qualquer pessoa da equipe. Escrita: só admin — a mesma regra do
 * cadastro de pessoas. Rotas estáticas ANTES das de `:id` (CLAUDE.md).
 */
@ApiTags('Consultores de campo')
@ApiBearerAuth()
@Controller('v1/consultores')
export class ConsultoresController {
  constructor(
    private readonly consultores: ConsultoresService,
    private readonly heatmap: HeatmapService,
    private readonly atencao: AtencaoService,
    private readonly followups: FollowupsService,
  ) {}

  @Get()
  list() {
    return this.consultores.list();
  }

  @AdminOnly()
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateConsultorDto) {
    return this.consultores.create(dto, user);
  }

  // ── estáticas: ANTES de ':id', senão ':id' captura "settings" e "visits" ──
  @Get('settings/channels')
  channels() {
    return this.consultores.channels();
  }

  @AdminOnly()
  @Put('settings/channels')
  setChannels(@Body() dto: ChannelsDto) {
    return this.consultores.setChannels(dto);
  }

  /** Mapa de calor e cobertura (§24): equipe, leitura, agregado em grade. */
  @Get('heatmap')
  heat(@Query() q: HeatmapQueryDto) {
    return this.heatmap.heatmap(q);
  }

  /** "Atenção agora" e meta do dia da equipe (§25.3): calculado na leitura. */
  @Get('attention')
  attention(@Query() q: PracaOpcionalQueryDto) {
    return this.atencao.painel(q.praca_id);
  }

  /** Fila de retornos de hoje e atrasados da equipe (§25.4). */
  @Get('followups')
  followupsDaEquipe(@Query() q: PracaOpcionalQueryDto) {
    return this.followups.equipe(q.praca_id);
  }

  @Get('visits/:visitId/photo')
  async photo(@Param('visitId') visitId: string, @Res({ passthrough: true }) res: FastifyReply) {
    const f = await this.consultores.photo(visitId);
    // Só no sucesso: erro (404/502/503) não pode ficar 24 h no cache do aparelho.
    void res.header('Cache-Control', 'private, max-age=86400');
    return new StreamableFile(f.bytes, { type: f.mime, disposition: 'inline' });
  }

  // ── rotas com :id ──
  @Get(':id')
  get(@Param('id') id: string) {
    return this.consultores.get(id);
  }

  @Get(':id/days/:day')
  day(@Param('id') id: string, @Param('day') day: string) {
    return this.consultores.day(id, day);
  }

  @AdminOnly()
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateConsultorDto) {
    return this.consultores.update(id, dto);
  }

  @AdminOnly()
  @HttpCode(200)
  @Post(':id/reset-password')
  resetPassword(@Param('id') id: string) {
    return this.consultores.resetPassword(id);
  }

  @AdminOnly()
  @HttpCode(200)
  @Post(':id/freela-sync')
  freelaSync(@Param('id') id: string) {
    return this.consultores.freelaSync(id);
  }

  @AdminOnly()
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.consultores.remove(id);
  }
}
