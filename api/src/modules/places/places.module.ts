import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../common/config/env.validation';
import type { FonteLugar } from '../../domain/places-rules';
import { ImportsModule } from '../imports/imports.module';
import { PlacesController } from './places.controller';
import { PlacesSearchService } from './places-search.service';
import { PLACES_LIMITS, PLACES_PROVIDERS, type PlacesLimits } from './places.tokens';
import { ApifyProvider } from './providers/apify.provider';
import { OverpassProvider } from './providers/overpass.provider';
import { dormir, type PlacesProvider } from './providers/places-provider';

@Module({
  imports: [ImportsModule],
  controllers: [PlacesController],
  providers: [
    PlacesSearchService,
    {
      provide: PLACES_PROVIDERS,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): Record<FonteLugar, PlacesProvider> => ({
        osm: new OverpassProvider({
          url: config.get('OVERPASS_URL', { infer: true }),
          userAgent: config.get('PLACES_USER_AGENT', { infer: true }),
          fetch: (url, init) => fetch(url, init),
          sleep: dormir,
        }),
        apify: new ApifyProvider({
          enabled: config.get('APIFY_ENABLED', { infer: true }) === 'true',
          token: config.get('APIFY_TOKEN', { infer: true }),
          actorId: config.get('APIFY_ACTOR_ID', { infer: true }),
          fetch: (url, init) => fetch(url, init),
        }),
      }),
    },
    {
      provide: PLACES_LIMITS,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): PlacesLimits => ({
        apifyMaxPerRun: config.get('APIFY_MAX_PLACES_PER_RUN', { infer: true }),
        apifyMonthlyCap: config.get('APIFY_MONTHLY_PLACES_CAP', { infer: true }),
      }),
    },
  ],
})
export class PlacesModule {}
