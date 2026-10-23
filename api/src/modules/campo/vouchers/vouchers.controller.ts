import { Body, Controller, Get, HttpCode, Param, Post, Put, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { AuthUser } from '../../../common/auth/auth-user';
import { CampoConsultant } from '../../../common/auth/campo-consultant';
import { AdminOnly } from '../../../common/decorators/admin-only.decorator';
import { CampoRoute } from '../../../common/decorators/campo-route.decorator';
import { CurrentConsultant } from '../../../common/decorators/current-consultant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import {
  AprovarVoucherDto,
  CandidatosQueryDto,
  ConfigVoucherDto,
  DesativarCupomDto,
  PedirVoucherDto,
  ReprovarVoucherDto,
  VazioVoucherDto,
  VincularContratanteDto,
  VouchersQueryDto,
} from './dto/vouchers.dto';
import { VouchersLigadoGuard } from './vouchers.guard';
import { VouchersService } from './vouchers.service';

/** Cupons da 1ª contratação — consultor (contrato §38.3). Sempre os do PRÓPRIO consultor. */
@ApiTags('Cupons')
@ApiBearerAuth()
@CampoRoute()
@UseGuards(VouchersLigadoGuard)
@Controller('v1/campo/vouchers')
export class VouchersCampoController {
  constructor(private readonly vouchers: VouchersService) {}

  @Post()
  async pedir(
    @CurrentConsultant() c: CampoConsultant,
    @Body() dto: PedirVoucherDto,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const { view, criado } = await this.vouchers.pedir(c, dto);
    // 201 = pedido novo; 200 = reenvio do mesmo `client_id` (fila offline).
    void res.code(criado ? 201 : 200);
    return view;
  }

  @Get()
  meus(@CurrentConsultant() c: CampoConsultant) {
    return this.vouchers.doConsultor(c);
  }
}

/**
 * Cupons — equipe (contrato §38.4). Leitura: equipe. Escrita: só admin (como a Lovable; o gestor é a fase L10). Estáticas ANTES
 * de `:id` (este controller é declarado antes do `ConsultoresController`, cujo `:id` casaria `/vouchers`).
 */
@ApiTags('Cupons')
@ApiBearerAuth()
@UseGuards(VouchersLigadoGuard)
@Controller('v1/consultores/vouchers')
export class VouchersEquipeController {
  constructor(private readonly vouchers: VouchersService) {}

  @Get()
  listar(@Query() q: VouchersQueryDto) {
    return this.vouchers.listar(q);
  }

  @Get('config')
  config() {
    return this.vouchers.configView();
  }

  @AdminOnly()
  @Put('config')
  salvarConfig(@CurrentUser() user: AuthUser, @Body() dto: ConfigVoucherDto) {
    return this.vouchers.salvarConfig(dto, user);
  }

  @Get(':id')
  detalhe(@Param('id') id: string) {
    return this.vouchers.detalhe(id);
  }

  @AdminOnly()
  @HttpCode(200)
  @Post(':id/approve')
  aprovar(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AprovarVoucherDto) {
    return this.vouchers.aprovar(id, dto, user);
  }

  @AdminOnly()
  @HttpCode(200)
  @Post(':id/reject')
  reprovar(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ReprovarVoucherDto) {
    return this.vouchers.reprovar(id, dto, user);
  }

  @AdminOnly()
  @Get(':id/contractor-candidates')
  candidatos(@Param('id') id: string, @Query() q: CandidatosQueryDto) {
    return this.vouchers.candidatos(id, q.q);
  }

  @AdminOnly()
  @HttpCode(200)
  @Post(':id/link-contractor')
  vincular(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: VincularContratanteDto) {
    return this.vouchers.vincular(id, dto, user);
  }

  @AdminOnly()
  @HttpCode(200)
  @Post(':id/coupon/retry')
  tentarDeNovo(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() _dto: VazioVoucherDto) {
    return this.vouchers.tentarDeNovo(id, user);
  }

  @AdminOnly()
  @HttpCode(200)
  @Post(':id/coupon/deactivate')
  desativar(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: DesativarCupomDto) {
    return this.vouchers.desativar(id, dto, user);
  }
}
