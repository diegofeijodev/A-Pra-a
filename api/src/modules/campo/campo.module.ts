import { Module } from '@nestjs/common';
import { validateEnv } from '../../common/config/env.validation';
import { CampoAuthController } from './campo-auth.controller';
import { CampoAuthService } from './campo-auth.service';
import { CampoController } from './campo.controller';
import { criarPhotoStorage, PHOTO_STORAGE } from './photo-storage';

/** Consultores de campo — spec 2026-10-08, contrato §20. */
@Module({
  controllers: [CampoAuthController, CampoController],
  providers: [
    CampoAuthService,
    // O `.env` já está em `process.env` (ConfigModule.forRoot) e foi validado na
    // largada; reler pelo mesmo schema dá o PHOTO_STORAGE já resolvido.
    { provide: PHOTO_STORAGE, useFactory: () => criarPhotoStorage(validateEnv(process.env)) },
  ],
})
export class CampoModule {}
