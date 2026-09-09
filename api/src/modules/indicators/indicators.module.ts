import { Module } from '@nestjs/common';
import { IndicatorsController } from './indicators.controller';
import { IndicatorsService } from './indicators.service';

// Indicadores só LEEM o resto do sistema (funil, ações, mídia, mensagens,
// etapas) — por isso nenhum `imports`: o retrato de cada requisição sai do
// Prisma (módulo global), sem depender de `LeadsService`/`MidiaService`. A
// única escrita é o lançamento à mão em `indicator_entries`.
@Module({
  controllers: [IndicatorsController],
  providers: [IndicatorsService],
  exports: [IndicatorsService],
})
export class IndicatorsModule {}
