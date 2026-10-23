import { Module } from '@nestjs/common';
import { validateEnv } from '../../common/config/env.validation';
import { FreelaClientModule } from '../freela/freela-client.module';
import { RotasModule } from '../rotas/rotas.module';
import { AtencaoService } from './atencao.service';
import { CampoAutocloseScheduler } from './campo-autoclose.scheduler';
import { CampoAuthController } from './campo-auth.controller';
import { CampoAuthService } from './campo-auth.service';
import { CampoFreelaService } from './campo-freela.service';
import { CampoController } from './campo.controller';
import { CompanySignupCampoController, CompanySignupEquipeController } from './company-signup.controller';
import { CompanySignupService } from './company-signup.service';
import { companySignupLigadoProvider } from './company-signup.tokens';
import { ConsultoresController } from './consultores.controller';
import { ConsultoresService } from './consultores.service';
import { DeclaredSignupsEquipeController } from './declared/declared-signups.controller';
import { DeclaredLigadoGuard } from './declared/declared.guard';
import { DeclaredSignupsService } from './declared/declared-signups.service';
import { EarningsCampoController, EarningsEquipeController } from './earnings/earnings.controller';
import { EarningsLigadoGuard } from './earnings/earnings.guard';
import { EARNINGS_INPUTS, PrismaEarningsInputs } from './earnings/earnings-inputs';
import { EARNINGS_REPOSITORY, PrismaEarningsRepository } from './earnings/earnings.repository';
import { EarningsScheduler } from './earnings/earnings.scheduler';
import { EarningsService } from './earnings/earnings.service';
import { earningsOpcoesProvider } from './earnings/earnings.tokens';
import { PayoutsCampoController, PayoutsEquipeController } from './payouts/payouts.controller';
import { PayoutsLigadoGuard } from './payouts/payouts.guard';
import { PAYOUTS_REPOSITORY, PrismaPayoutsRepository } from './payouts/payouts.repository';
import { PayoutsService } from './payouts/payouts.service';
import { payoutsOpcoesProvider } from './payouts/payouts.tokens';
import { FollowupsService } from './followups.service';
import { CadastrosDoDiaService } from './painel/cadastros-do-dia.service';
import { DashboardLigadoGuard, DaySummaryLigadoGuard, MapPinsLigadoGuard } from './painel/lovable.guards';
import { PainelEquipeController, ResumoDiaCampoController, ResumoDiaEquipeController } from './painel/painel.controller';
import { PainelService } from './painel/painel.service';
import { PinosCampoController, PinosEquipeController } from './pinos/pinos.controller';
import { PinosService } from './pinos/pinos.service';
import { ResumoDiaService } from './painel/resumo-dia.service';
import { HeatmapService } from './heatmap.service';
import { JourneysService } from './journeys.service';
import { criarPhotoStorage, PHOTO_STORAGE } from './photo-storage';
import { PlacesService } from './places.service';
import { SignupSyncScheduler } from './signup-sync.scheduler';
import { SignupSyncService } from './signup-sync.service';
import { signupSyncOpcoesProvider } from './signup-sync.tokens';
import { SignupsCampoController, SignupsEquipeController } from './signups.controller';
import { SignupsLeituraService } from './signups-leitura.service';
import { VisitsService } from './visits.service';
import { BreaksService } from './breaks.service';
import { VoucherCouponsService } from './vouchers/voucher-coupons.service';
import { VouchersCampoController, VouchersEquipeController } from './vouchers/vouchers.controller';
import { VouchersLigadoGuard } from './vouchers/vouchers.guard';
import { PrismaVouchersRepository, VOUCHERS_REPOSITORY } from './vouchers/vouchers.repository';
import { VouchersService } from './vouchers/vouchers.service';
import { voucherIssuerProvider } from './vouchers/vouchers.tokens';

/**
 * Consultores de campo — spec 2026-10-08, contrato §20.
 *
 * Só depende do `FreelaClientModule` e do `RotasModule` (folhas). O `FreelaModule` importa ESTE
 * módulo para o relógio de 2 min repetir o código pendente — sem ciclo.
 */
@Module({
  imports: [FreelaClientModule, RotasModule],
  controllers: [
    // Antes de ConsultoresController: `GET /v1/consultores/signups` e `/earnings` não podem cair em `:id`.
    SignupsEquipeController,
    EarningsEquipeController,
    DeclaredSignupsEquipeController,
    PayoutsEquipeController,
    // Restante da Lovable, lote A (contrato §33): antes do `:id` de ConsultoresController.
    PainelEquipeController,
    ResumoDiaEquipeController,
    ResumoDiaCampoController,
    PinosEquipeController,
    PinosCampoController,
    // Lote C (contrato §38): `/v1/consultores/vouchers` antes do `:id` de ConsultoresController.
    VouchersEquipeController,
    VouchersCampoController,
    PayoutsCampoController,
    EarningsCampoController,
    SignupsCampoController,
    CampoAuthController,
    CampoController,
    ConsultoresController,
    CompanySignupCampoController,
    CompanySignupEquipeController,
  ],
  providers: [
    CampoAuthService,
    CampoFreelaService,
    ConsultoresService,
    HeatmapService,
    AtencaoService,
    FollowupsService,
    JourneysService,
    CampoAutocloseScheduler,
    PlacesService,
    VisitsService,
    BreaksService,
    CompanySignupService,
    companySignupLigadoProvider,
    SignupSyncService,
    SignupSyncScheduler,
    signupSyncOpcoesProvider,
    SignupsLeituraService,
    EarningsService,
    EarningsScheduler,
    EarningsLigadoGuard,
    DeclaredSignupsService,
    DeclaredLigadoGuard,
    earningsOpcoesProvider,
    PayoutsService,
    PayoutsLigadoGuard,
    payoutsOpcoesProvider,
    CadastrosDoDiaService,
    PainelService,
    ResumoDiaService,
    PinosService,
    DashboardLigadoGuard,
    DaySummaryLigadoGuard,
    MapPinsLigadoGuard,
    VouchersService,
    VoucherCouponsService,
    VouchersLigadoGuard,
    voucherIssuerProvider,
    { provide: VOUCHERS_REPOSITORY, useClass: PrismaVouchersRepository },
    { provide: PAYOUTS_REPOSITORY, useClass: PrismaPayoutsRepository },
    { provide: EARNINGS_REPOSITORY, useClass: PrismaEarningsRepository },
    { provide: EARNINGS_INPUTS, useClass: PrismaEarningsInputs },
    // O `.env` já está em `process.env` (ConfigModule.forRoot) e foi validado na
    // largada; reler pelo mesmo schema dá o PHOTO_STORAGE já resolvido.
    { provide: PHOTO_STORAGE, useFactory: () => criarPhotoStorage(validateEnv(process.env)) },
  ],
  exports: [CampoFreelaService, VoucherCouponsService],
})
export class CampoModule {}
