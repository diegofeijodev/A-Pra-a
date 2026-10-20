import { Module } from '@nestjs/common';
import { RotasCampoController } from './rotas-campo.controller';
import { RotasCampoService } from './rotas-campo.service';
import { RotasConfigService } from './rotas-config.service';
import { RotasConfigController, RotasEquipeController } from './rotas-equipe.controller';
import { RotasEquipeService } from './rotas-equipe.service';
import { ROTAS_LIGADAS, rotasLigadasProvider } from './rotas.tokens';

/**
 * Roteiro do dia (F3, contrato §23). Folha: não importa o CampoModule — é o CampoModule que
 * importa este (início da jornada gera o roteiro; o check-in marca a parada).
 */
@Module({
  controllers: [RotasCampoController, RotasEquipeController, RotasConfigController],
  providers: [RotasConfigService, RotasCampoService, RotasEquipeService, rotasLigadasProvider],
  exports: [RotasCampoService, RotasConfigService, ROTAS_LIGADAS],
})
export class RotasModule {}
