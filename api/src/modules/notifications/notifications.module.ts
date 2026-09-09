import { Module } from '@nestjs/common';
import { ActionsModule } from '../actions/actions.module';
import { LeadsModule } from '../leads/leads.module';
import { MidiaModule } from '../midia/midia.module';
import { PracasModule } from '../pracas/pracas.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

// Os avisos do sino são um RETRATO de cima de quatro áreas (praça/etapas,
// ações, leads, mídia) — por isso os quatro módulos entram aqui, cada um só
// pela leitura que já expõe (`steps`, `list`, `fillBrake`/`listCampanhas`).
// A única escrita própria é a dispensa (`user_dismissed_notifs`), direto pelo
// Prisma global.
@Module({
  imports: [PracasModule, ActionsModule, LeadsModule, MidiaModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
