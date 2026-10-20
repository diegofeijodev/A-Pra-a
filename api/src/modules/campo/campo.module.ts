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
import { FollowupsService } from './followups.service';
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

/**
 * Consultores de campo — spec 2026-10-08, contrato §20.
 *
 * Só depende do `FreelaClientModule` e do `RotasModule` (folhas). O `FreelaModule` importa ESTE
 * módulo para o relógio de 2 min repetir o código pendente — sem ciclo.
 */
@Module({
  imports: [FreelaClientModule, RotasModule],
  controllers: [
    // Antes de ConsultoresController: `GET /v1/consultores/signups` não pode cair em `:id`.
    SignupsEquipeController,
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
    CompanySignupService,
    companySignupLigadoProvider,
    SignupSyncService,
    SignupSyncScheduler,
    signupSyncOpcoesProvider,
    SignupsLeituraService,
    // O `.env` já está em `process.env` (ConfigModule.forRoot) e foi validado na
    // largada; reler pelo mesmo schema dá o PHOTO_STORAGE já resolvido.
    { provide: PHOTO_STORAGE, useFactory: () => criarPhotoStorage(validateEnv(process.env)) },
  ],
  exports: [CampoFreelaService],
})
export class CampoModule {}
