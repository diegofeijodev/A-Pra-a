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
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { AuthUser } from '../../common/auth/auth-user';
import { AdminOnly } from '../../common/decorators/admin-only.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ConsultoresService } from './consultores.service';
import { ChannelsDto, CnaesDto, CreateConsultorDto, UpdateConsultorDto } from './dto/consultores.dto';

/**
 * Telas da equipe sobre os consultores de campo (`/v1/consultores`, §20.4).
 * Leitura: qualquer pessoa da equipe. Escrita: só admin — a mesma regra do
 * cadastro de pessoas. Rotas estáticas ANTES das de `:id` (CLAUDE.md).
 */
@ApiTags('Consultores de campo')
@ApiBearerAuth()
@Controller('v1/consultores')
export class ConsultoresController {
  constructor(private readonly consultores: ConsultoresService) {}

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

  @Get('settings/cnaes')
  cnaes() {
    return this.consultores.cnaes();
  }

  @AdminOnly()
  @Put('settings/cnaes')
  setCnaes(@Body() dto: CnaesDto) {
    return this.consultores.setCnaes(dto);
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
