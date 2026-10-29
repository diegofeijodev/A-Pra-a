import { Module } from '@nestjs/common';
import { FreelaClientModule } from '../freela/freela-client.module';
import { GeoModule } from '../geo/geo.module';
import { RotasModule } from '../rotas/rotas.module';
import { EtapasAutomaticasService } from './etapas-automaticas.service';
import { QuadroFreelaService } from './quadro-freela.service';
import { SemRespostaService } from './sem-resposta.service';

/**
 * CRM automático (contrato §47, arquitetura §2.2). Só importa módulos FOLHA (`RotasModule`: a regra de "cadastro confirmado"
 * do sync; `FreelaClientModule`: o quadro de contratantes da A3; `GeoModule`: as vizinhas da praça com UF); `places` e `campo`
 * nunca importam este módulo. Prisma e as chaves (`CrmFlagsModule`) são globais.
 */
@Module({
  imports: [RotasModule, FreelaClientModule, GeoModule],
  providers: [EtapasAutomaticasService, SemRespostaService, QuadroFreelaService],
  exports: [EtapasAutomaticasService, SemRespostaService, QuadroFreelaService],
})
export class CrmModule {}
