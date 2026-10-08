import { Module } from '@nestjs/common';
import { CampoAuthController } from './campo-auth.controller';
import { CampoAuthService } from './campo-auth.service';
import { CampoController } from './campo.controller';

/** Consultores de campo — spec 2026-10-08, contrato §20. */
@Module({
  controllers: [CampoAuthController, CampoController],
  providers: [CampoAuthService],
})
export class CampoModule {}
