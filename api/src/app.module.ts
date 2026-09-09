import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { validateEnv } from './common/config/env.validation';
import { PrismaModule } from './common/database/prisma.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { HealthModule } from './common/health/health.module';
import { ActionsModule } from './modules/actions/actions.module';
import { AuthModule } from './modules/auth/auth.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { GeoModule } from './modules/geo/geo.module';
import { ImportsModule } from './modules/imports/imports.module';
import { LeadsModule } from './modules/leads/leads.module';
import { PracasModule } from './modules/pracas/pracas.module';
import { PublicModule } from './modules/public/public.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    ScheduleModule.forRoot(),
    PrismaModule,
    HealthModule,
    AuthModule,
    UsersModule,
    CatalogModule,
    GeoModule,
    PracasModule,
    ActionsModule,
    LeadsModule,
    ImportsModule,
    PublicModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Depois do Throttler: barra abuso de tráfego antes de gastar CPU
    // verificando token. Global — rotas ficam fechadas por padrão, `@Public()`
    // é a exceção explícita.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
