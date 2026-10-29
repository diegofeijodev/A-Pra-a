import { Module } from '@nestjs/common';
import { RotasModule } from '../rotas/rotas.module';
import { EtapasAutomaticasService } from './etapas-automaticas.service';

/**
 * CRM automático (contrato §47, arquitetura §2.2). Só importa módulos FOLHA (`RotasModule`: a regra de "cadastro confirmado"
 * do sync); `places` e `campo` nunca importam este módulo. Prisma e as chaves (`CrmFlagsModule`) são globais.
 */
@Module({
  imports: [RotasModule],
  providers: [EtapasAutomaticasService],
  exports: [EtapasAutomaticasService],
})
export class CrmModule {}
