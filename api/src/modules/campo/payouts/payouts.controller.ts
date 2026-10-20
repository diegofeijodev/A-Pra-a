import { Body, Controller, Get, Header, HttpCode, NotFoundException, Param, Post, Query, Req, Res, StreamableFile, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AuthUser } from '../../../common/auth/auth-user';
import { CampoConsultant } from '../../../common/auth/campo-consultant';
import { AdminOnly } from '../../../common/decorators/admin-only.decorator';
import { CampoRoute } from '../../../common/decorators/campo-route.decorator';
import { CurrentConsultant } from '../../../common/decorators/current-consultant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { isUuid } from '../../../common/ids/uuid';
import { ExportQueryDto, GerarDto, MotivoDto, PayoutsQueryDto, VazioDto } from './dto/payouts.dto';
import { lerPagarMultipart } from './multipart-comprovante';
import { PayoutsLigadoGuard } from './payouts.guard';
import { PayoutsService } from './payouts.service';

const naoEncontrado = () => new NotFoundException({ code: 'NOT_FOUND', message: 'Pagamento não encontrado.' });
const ator = (u: AuthUser) => ({ id: u.id, name: u.name });

/** Comprovante e chave nunca ficam em cache nem são interpretados pelo navegador como outro tipo. */
function entregar(res: FastifyReply, f: { bytes: Buffer; mime: string }): StreamableFile {
  res.header('Cache-Control', 'no-store');
  res.header('X-Content-Type-Options', 'nosniff');
  return new StreamableFile(f.bytes, { type: f.mime, disposition: 'inline' });
}

/**
 * Pagamentos — equipe (contrato §29.4). Leitura: equipe. Escrita: só admin. Estáticas ANTES de `:id`
 * (este controller é declarado antes do `ConsultoresController`, cujo `:id` casaria `/payouts`).
 */
@ApiTags('Pagamentos')
@ApiBearerAuth()
@UseGuards(PayoutsLigadoGuard)
@Controller('v1/consultores/payouts')
export class PayoutsEquipeController {
  constructor(private readonly payouts: PayoutsService) {}

  @Get()
  listar(@Query() q: PayoutsQueryDto) {
    return this.payouts.listar(q);
  }

  @AdminOnly()
  @HttpCode(200)
  @Post('generate')
  gerar(@CurrentUser() user: AuthUser, @Body() dto: GerarDto) {
    return this.payouts.gerar(dto.week_start, ator(user));
  }

  @AdminOnly()
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  @Get('export.csv')
  async exportar(@CurrentUser() user: AuthUser, @Query() q: ExportQueryDto, @Res({ passthrough: true }) res: FastifyReply) {
    const { filename, csv } = await this.payouts.exportarCsv({ ...q, include_pix_key: q.include_pix_key === 'true' }, ator(user));
    res.header('Content-Disposition', `attachment; filename="${filename}"`);
    return csv;
  }

  @Get(':id')
  detalhe(@Param('id') id: string) {
    return this.payouts.detalhe(this.uuid(id));
  }

  @AdminOnly()
  @HttpCode(200)
  @Post(':id/pay')
  async pagar(@CurrentUser() user: AuthUser, @Param('id') id: string, @Req() req: FastifyRequest) {
    const uuid = this.uuid(id);
    const { campos, proof } = await lerPagarMultipart(req);
    return this.payouts.pagar(uuid, { ...campos, proof }, ator(user));
  }

  @AdminOnly()
  @HttpCode(200)
  @Post(':id/fail')
  falhou(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: MotivoDto) {
    return this.payouts.mudar(this.uuid(id), 'fail', dto.reason, ator(user));
  }

  @AdminOnly()
  @HttpCode(200)
  @Post(':id/retry')
  tentarDeNovo(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() _dto: VazioDto) {
    return this.payouts.mudar(this.uuid(id), 'retry', null, ator(user));
  }

  @AdminOnly()
  @HttpCode(200)
  @Post(':id/cancel')
  cancelar(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: MotivoDto) {
    return this.payouts.mudar(this.uuid(id), 'cancel', dto.reason, ator(user));
  }

  @AdminOnly()
  @HttpCode(200)
  @Post(':id/reverse')
  estornar(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: MotivoDto) {
    return this.payouts.mudar(this.uuid(id), 'reverse', dto.reason, ator(user));
  }

  @Get(':id/proof')
  async comprovante(@Param('id') id: string, @Res({ passthrough: true }) res: FastifyReply) {
    return entregar(res, await this.payouts.comprovante(this.uuid(id)));
  }

  @AdminOnly()
  @Header('Cache-Control', 'no-store')
  @Get(':id/pix-key')
  chavePix(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.payouts.chavePix(this.uuid(id), ator(user));
  }

  private uuid(id: string): string {
    if (!isUuid(id)) throw naoEncontrado();
    return id;
  }
}

/** Pix do PRÓPRIO consultor (contrato §29.6): o id vem do token, nunca da requisição. */
@ApiTags('Campo — pagamentos')
@ApiBearerAuth()
@CampoRoute()
@UseGuards(PayoutsLigadoGuard)
@Controller('v1/campo/payouts')
export class PayoutsCampoController {
  constructor(private readonly payouts: PayoutsService) {}

  @Get()
  meus(@CurrentConsultant() c: CampoConsultant) {
    return this.payouts.doConsultor(c);
  }

  @Get(':id/proof')
  async comprovante(@CurrentConsultant() c: CampoConsultant, @Param('id') id: string, @Res({ passthrough: true }) res: FastifyReply) {
    if (!isUuid(id)) throw naoEncontrado();
    return entregar(res, await this.payouts.comprovanteDoConsultor(id, c));
  }
}
