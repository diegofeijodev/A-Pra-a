import { Module } from '@nestjs/common';
import { CampoModule } from '../campo/campo.module';
import { DisparosModule } from '../disparos/disparos.module';
import { MessagesModule } from '../messages/messages.module';
import { FreelaCampaignsService } from './freela-campaigns.service';
import { FreelaClientModule } from './freela-client.module';
import { FreelaController } from './freela.controller';
import { FreelaOutboxService } from './freela-outbox.service';
import { FreelaSyncScheduler } from './freela-sync.scheduler';
import { FreelaTemplatesService } from './freela-templates.service';

/**
 * Integração com o Freela — §7. `DisparosModule` entra pelo público da campanha
 * `EXTERNAL_LIST` (é o MESMO filtro do disparo, com lista de bloqueio e trava
 * de 30 dias) e `MessagesModule` pelo ritmo e pelos valores-padrão das
 * variáveis: o modelo que sobe para o Freela é o mesmo que a prévia mostrou.
 */
@Module({
  imports: [FreelaClientModule, DisparosModule, MessagesModule, CampoModule],
  controllers: [FreelaController],
  providers: [FreelaCampaignsService, FreelaTemplatesService, FreelaOutboxService, FreelaSyncScheduler],
  exports: [FreelaCampaignsService, FreelaOutboxService],
})
export class FreelaModule {}
