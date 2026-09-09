import { Module } from '@nestjs/common';
import { LeadsModule } from '../leads/leads.module';
import { MessagesModule } from '../messages/messages.module';
import { DisparosController } from './disparos.controller';
import { DisparosService } from './disparos.service';
import { SendsController } from './sends.controller';

// `LeadsModule` entra pelo `toListView`: o público do disparo é a mesma linha
// do funil (inclusive `stalled_days`, que é regra pura). `MessagesModule` entra
// pelas configurações de envio, pelos vizinhos do render e pela lista de
// bloqueio — o disparo não reimplementa nenhuma das três.
@Module({
  imports: [LeadsModule, MessagesModule],
  controllers: [DisparosController, SendsController],
  providers: [DisparosService],
  exports: [DisparosService],
})
export class DisparosModule {}
