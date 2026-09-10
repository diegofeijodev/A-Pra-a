/**
 * Rotas `/v1/freela/*` — as telas **Freela → Conexão / Campanhas /
 * Automáticas**.
 *
 * Todas exigem JWT e **todas menos `GET /status`** respondem `503
 * FREELA_NOT_CONFIGURED` sem a conexão configurada: `status` é a rota que
 * explica por que as outras não respondem, então ela mesma não pode falhar.
 *
 * `:id` aqui é o id **do Freela** (string livre, não UUID do Praça): é o que a
 * lista de lá devolve e o que o vínculo local guarda em `freela_id`.
 */
import { Body, Controller, Get, Param, Patch, Post, Put, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { MultipartFile } from '@fastify/multipart';
import { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  AudienceOptionsQueryDto,
  AudiencePreviewDto,
  CreateFreelaCampaignDto,
  CreateFreelaTemplateDto,
  FreelaListQueryDto,
  SetEnabledDto,
  UpdateFreelaTemplateDto,
} from './dto/freela.dto';
import { FreelaCampaignsService } from './freela-campaigns.service';
import { FreelaTemplatesService } from './freela-templates.service';

@ApiTags('Freela')
@ApiBearerAuth()
@Controller('v1/freela')
export class FreelaController {
  constructor(
    private readonly campaigns: FreelaCampaignsService,
    private readonly templates: FreelaTemplatesService,
  ) {}

  // ── conexão e público ───────────────────────────────────────
  @Get('status')
  status() {
    return this.campaigns.status();
  }

  @Get('audience-options')
  audienceOptions(@Query() query: AudienceOptionsQueryDto) {
    return this.campaigns.audienceOptions(query.audience);
  }

  @Post('audience-preview')
  audiencePreview(@Body() dto: AudiencePreviewDto) {
    return this.campaigns.audiencePreview(dto);
  }

  // ── campanhas normais ───────────────────────────────────────
  @Get('campaigns')
  listCampaigns(@Query() query: FreelaListQueryDto) {
    return this.campaigns.list(query.praca_id);
  }

  @Post('campaigns')
  createCampaign(@CurrentUser() user: AuthUser, @Body() dto: CreateFreelaCampaignDto) {
    return this.campaigns.create(dto, user);
  }

  @Get('campaigns/:id')
  getCampaign(@Param('id') id: string) {
    return this.campaigns.detail(id);
  }

  @Patch('campaigns/:id/start')
  start(@Param('id') id: string) {
    return this.campaigns.setState(id, 'start');
  }

  @Patch('campaigns/:id/pause')
  pause(@Param('id') id: string) {
    return this.campaigns.setState(id, 'pause');
  }

  @Patch('campaigns/:id/cancel')
  cancel(@Param('id') id: string) {
    return this.campaigns.setState(id, 'cancel');
  }

  // ── campanhas automáticas ───────────────────────────────────
  @Get('templates')
  listTemplates(@Query() query: FreelaListQueryDto) {
    return this.templates.list(query.praca_id);
  }

  // Rota estática ANTES da de ':id' — a ordem importa (CLAUDE.md).
  @Post('templates/upload')
  @ApiConsumes('multipart/form-data')
  async upload(@Req() req: FastifyRequest) {
    const file = await this.readFile(req);
    return this.templates.uploadImage(file);
  }

  @Post('templates')
  createTemplate(@CurrentUser() user: AuthUser, @Body() dto: CreateFreelaTemplateDto) {
    return this.templates.create(dto, user);
  }

  @Get('templates/:id')
  getTemplate(@Param('id') id: string) {
    return this.templates.get(id);
  }

  @Put('templates/:id')
  updateTemplate(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateFreelaTemplateDto,
  ) {
    return this.templates.update(id, dto, user);
  }

  @Patch('templates/:id/enabled')
  setEnabled(@Param('id') id: string, @Body() dto: SetEnabledDto) {
    return this.templates.setEnabled(id, dto.enabled);
  }

  /**
   * Lê o arquivo do `multipart/form-data` (campo `file`). O teto de 5 MB é do
   * `@fastify/multipart` registrado no `main.ts`: estourar vira 413 com
   * mensagem, não 500.
   */
  private async readFile(req: FastifyRequest): Promise<{
    field: string;
    filename: string;
    mimetype: string;
    buffer: Buffer;
  }> {
    let parte: MultipartFile | undefined;
    try {
      parte = await req.file();
    } catch {
      parte = undefined;
    }
    if (!parte) {
      throw new BadRequestException({
        code: 'FILE_REQUIRED',
        message: 'Envie a imagem no campo `file` (multipart/form-data).',
      });
    }
    let buffer: Buffer;
    try {
      buffer = await parte.toBuffer();
    } catch {
      throw new PayloadTooLargeException({
        code: 'FILE_TOO_LARGE',
        message: 'A imagem passou de 5 MB.',
      });
    }
    return {
      field: 'file',
      filename: parte.filename || 'imagem',
      mimetype: parte.mimetype,
      buffer,
    };
  }
}
