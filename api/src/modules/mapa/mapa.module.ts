import { Module } from '@nestjs/common';
import { GeocodeScheduler } from './geocode.scheduler';
import { GeocodeService } from './geocode.service';
import { GEOCODER, geocoderDoAmbiente } from './geocoder';
import { MapaController } from './mapa.controller';
import { MapaService } from './mapa.service';

@Module({
  controllers: [MapaController],
  providers: [
    { provide: GEOCODER, useFactory: () => geocoderDoAmbiente() },
    GeocodeService,
    GeocodeScheduler,
    MapaService,
  ],
})
export class MapaModule {}
