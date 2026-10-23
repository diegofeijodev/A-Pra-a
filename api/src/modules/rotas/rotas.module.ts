import { Module } from '@nestjs/common';
import { RotasCampoController } from './rotas-campo.controller';
import { RotasCampoService } from './rotas-campo.service';
import { RotasConfigService } from './rotas-config.service';
import { RotasConfigController, RotasEquipeController } from './rotas-equipe.controller';
import { RotasEquipeService } from './rotas-equipe.service';
import { ModoCampoService } from './modo-campo.service';
import { MinhasRotasController, PlanosController } from './planos/planos.controller';
import { PlanosService } from './planos/planos.service';
import {
  FLUXO_SELECT_LIGADO,
  fluxoSelectLigadoProvider,
  LOVABLE_A_FLAGS,
  LOVABLE_B_FLAGS,
  LOVABLE_C_FLAGS,
  LOVABLE_D_FLAGS,
  lovableAFlagsProvider,
  lovableBFlagsProvider,
  lovableCFlagsProvider,
  lovableDFlagsProvider,
  ROTAS_LIGADAS,
  rotasLigadasProvider,
} from './rotas.tokens';

/**
 * Roteiro do dia (F3, contrato §23). Folha: não importa o CampoModule — é o CampoModule que
 * importa este (início da jornada gera o roteiro; o check-in marca a parada).
 */
@Module({
  controllers: [RotasCampoController, RotasEquipeController, RotasConfigController, PlanosController, MinhasRotasController],
  providers: [RotasConfigService, RotasCampoService, RotasEquipeService, PlanosService, rotasLigadasProvider, fluxoSelectLigadoProvider, lovableAFlagsProvider, lovableBFlagsProvider, lovableCFlagsProvider, lovableDFlagsProvider, ModoCampoService],
  exports: [RotasCampoService, RotasConfigService, ROTAS_LIGADAS, FLUXO_SELECT_LIGADO, LOVABLE_A_FLAGS, LOVABLE_B_FLAGS, LOVABLE_C_FLAGS, LOVABLE_D_FLAGS, ModoCampoService],
})
export class RotasModule {}
