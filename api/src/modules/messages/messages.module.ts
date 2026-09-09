import { Module } from '@nestjs/common';
import { LeadsModule } from '../leads/leads.module';
import { BlocklistController } from './blocklist.controller';
import { MessagesService } from './messages.service';
import { SettingsController } from './settings.controller';
import { TemplatesController } from './templates.controller';

// `LeadsModule` entra por causa do render com `lead_id`: a prévia usa a mesma
// leitura de lead da tela do funil (404 e tudo), em vez de reconsultar o banco
// por fora e divergir dela.
@Module({
  imports: [LeadsModule],
  controllers: [TemplatesController, SettingsController, BlocklistController],
  providers: [MessagesService],
  exports: [MessagesService],
})
export class MessagesModule {}
