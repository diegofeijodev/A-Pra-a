import { Module } from '@nestjs/common';
import { FreelaClientModule } from '../freela/freela-client.module';
import { GeoModule } from '../geo/geo.module';
import { RotasModule } from '../rotas/rotas.module';
import { AutomacoesService } from './automacoes.service';
import { CrmController } from './crm.controller';
import { CrmScheduler } from './crm.scheduler';
import { EtapasAutomaticasService } from './etapas-automaticas.service';
import { QuadroFreelaService } from './quadro-freela.service';
import { ResumoService } from './resumo.service';
import { SemRespostaService } from './sem-resposta.service';
import { TarefasService } from './tarefas.service';

/**
 * CRM automático (contrato §47, arquitetura §2.2). Só importa módulos FOLHA (`RotasModule`: a regra de "cadastro confirmado"
 * do sync; `FreelaClientModule`: o quadro de contratantes da A3; `GeoModule`: as vizinhas da praça com UF); `places` e `campo`
 * nunca importam este módulo. Prisma e as chaves (`CrmFlagsModule`) são globais.
 */
@Module({
  imports: [RotasModule, FreelaClientModule, GeoModule],
  controllers: [CrmController],
  providers: [AutomacoesService, EtapasAutomaticasService, SemRespostaService, QuadroFreelaService, TarefasService, ResumoService, CrmScheduler],
  exports: [EtapasAutomaticasService, SemRespostaService, QuadroFreelaService],
})
export class CrmModule {}
