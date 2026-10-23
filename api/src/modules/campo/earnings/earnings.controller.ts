import { Body, Controller, Get, HttpCode, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../../../common/auth/auth-user';
import { CampoConsultant } from '../../../common/auth/campo-consultant';
import { AdminOnly, Equipe } from '../../../common/decorators/admin-only.decorator';
import { CampoRoute } from '../../../common/decorators/campo-route.decorator';
import { CurrentConsultant } from '../../../common/decorators/current-consultant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { isUuid } from '../../../common/ids/uuid';
import { NotFoundException } from '@nestjs/common';
import { AjusteDto, ConfigRemuneracaoDto, EarningsQueryDto, EstornoDto, FecharDto, ReconciliarDto, RegraConsultorDto, RegrasConsultorQueryDto, SimularDto } from './dto/earnings.dto';
import { EarningsLigadoGuard, PorConsultorLigadoGuard } from './earnings.guard';
import { EarningsService } from './earnings.service';

/**
 * Remuneração — equipe (contrato §28.5). Leitura: equipe. Escrita: só admin. Sem `@CampoRoute()`: o consultor
 * não acessa. Estáticas ANTES do `:id` de `/v1/consultores` (este controller é declarado antes no módulo).
 */
@ApiTags('Remuneração')
@ApiBearerAuth()
@UseGuards(EarningsLigadoGuard)
@Controller('v1/consultores/earnings')
export class EarningsEquipeController {
  constructor(private readonly earnings: EarningsService) {}

  @Get('config')
  config() {
    return this.earnings.lerConfig();
  }

  @AdminOnly()
  @Put('config')
  salvarConfig(@CurrentUser() user: AuthUser, @Body() dto: ConfigRemuneracaoDto) {
    return this.earnings.salvarConfig(dto, user);
  }

  @Equipe()
  @HttpCode(200)
  @Post('simulate')
  simular(@Body() dto: SimularDto) {
    return this.earnings.simular(dto);
  }

  /** L13 §45.4: regra própria do consultor. Leitura e escrita SÓ admin (o gestor não vê pagamento nem configuração). */
  @AdminOnly()
  @UseGuards(PorConsultorLigadoGuard)
  @Get('consultant-rules')
  regrasDoConsultor(@Query() q: RegrasConsultorQueryDto) {
    return this.earnings.regrasDoConsultor(q.consultant_id);
  }

  @AdminOnly()
  @UseGuards(PorConsultorLigadoGuard)
  @Post('consultant-rules')
  criarRegraDoConsultor(@CurrentUser() user: AuthUser, @Body() dto: RegraConsultorDto) {
    return this.earnings.criarRegraDoConsultor(dto, user);
  }

  @Get()
  extrato(@Query() q: EarningsQueryDto) {
    return this.earnings.equipe(q);
  }

  @AdminOnly()
  @HttpCode(200)
  @Post('close')
  fechar(@CurrentUser() user: AuthUser, @Body() dto: FecharDto) {
    return this.earnings.fechar(dto, { id: user.id, name: user.name }, 'manual');
  }

  @AdminOnly()
  @HttpCode(200)
  @Post('reconcile')
  reconciliar(@CurrentUser() user: AuthUser, @Body() dto: ReconciliarDto) {
    return this.earnings.reconciliar(dto, { id: user.id, name: user.name });
  }

  @AdminOnly()
  @Post('adjustments')
  ajustar(@CurrentUser() user: AuthUser, @Body() dto: AjusteDto) {
    return this.earnings.ajustar(dto, user);
  }

  @AdminOnly()
  @Post('adjustments/:id/reverse')
  estornar(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: EstornoDto) {
    if (!isUuid(id)) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Lançamento não encontrado.' });
    return this.earnings.estornar(id, dto, user);
  }
}

/** Ganhos do PRÓPRIO consultor (contrato §28.6): o id vem do token, nunca da requisição. */
@ApiTags('Campo — ganhos')
@ApiBearerAuth()
@CampoRoute()
@UseGuards(EarningsLigadoGuard)
@Controller('v1/campo')
export class EarningsCampoController {
  constructor(private readonly earnings: EarningsService) {}

  @Get('earnings')
  meus(@CurrentConsultant() c: CampoConsultant) {
    return this.earnings.doConsultor(c);
  }
}
