import { Module } from '@nestjs/common';
import { MessagesModule } from '../messages/messages.module';
import { CadenceEngineService } from './cadence-engine.service';
import { CadenceScheduler } from './cadence.scheduler';
import { CadencesController, EnrollmentsController } from './cadences.controller';
import { CadencesService } from './cadences.service';

// `MessagesModule` entra pelas configurações de envio (janela, limite diário,
// valores-padrão das variáveis), pela lista de bloqueio e pelos vizinhos do
// render: o motor da cadência manda mensagem pelas MESMAS regras do disparo,
// sem reimplementar nenhuma delas.
@Module({
  imports: [MessagesModule],
  controllers: [CadencesController, EnrollmentsController],
  providers: [CadencesService, CadenceEngineService, CadenceScheduler],
  exports: [CadencesService, CadenceEngineService],
})
export class CadencesModule {}
