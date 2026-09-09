import { Module } from '@nestjs/common';
import { CampanhasController } from './campanhas.controller';
import { CreativesController } from './creatives.controller';
import { MidiaService } from './midia.service';
import { ProofsController } from './proofs.controller';
import { TrafficController } from './traffic.controller';

// Quatro rotas de topo (`/v1/campanhas`, `/v1/creatives`, `/v1/traffic`,
// `/v1/proofs`) num serviço só: campanha, criativo, entrada de tráfego e prova
// são a MESMA regra vista de ângulos diferentes — os números da campanha saem
// dos dias de tráfego e dos leads, e o portão do playbook trava as quatro.
// Sem `imports`: o módulo lê praça, etapas e leads pelo Prisma (global), sem
// depender do `PracasService` nem do `LeadsService`.
@Module({
  controllers: [CampanhasController, CreativesController, TrafficController, ProofsController],
  providers: [MidiaService],
  exports: [MidiaService],
})
export class MidiaModule {}
