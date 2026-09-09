import { Module } from '@nestjs/common';
import { GeoModule } from '../geo/geo.module';
import { AgendaService } from './agenda.service';
import { PracasController } from './pracas.controller';
import { PracasService } from './pracas.service';

@Module({
  imports: [GeoModule],
  controllers: [PracasController],
  providers: [PracasService, AgendaService],
  exports: [PracasService],
})
export class PracasModule {}
