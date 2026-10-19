import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';

import { validateEnv } from './common/config/env.validation';
import { AppThrottlerGuard } from './common/guards/app-throttler.guard';
import { PrismaModule } from './common/database/prisma.module';
import { CampoAuthGuard } from './common/guards/campo-auth.guard';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { HealthModule } from './common/health/health.module';
import { ActionsModule } from './modules/actions/actions.module';
import { AreasModule } from './modules/areas/areas.module';
import { AuthModule } from './modules/auth/auth.module';
import { CadencesModule } from './modules/cadences/cadences.module';
import { CampoModule } from './modules/campo/campo.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { DisparosModule } from './modules/disparos/disparos.module';
import { FreelaModule } from './modules/freela/freela.module';
import { GeoModule } from './modules/geo/geo.module';
import { ImportsModule } from './modules/imports/imports.module';
import { IndicatorsModule } from './modules/indicators/indicators.module';
import { LeadsModule } from './modules/leads/leads.module';
import { MessagesModule } from './modules/messages/messages.module';
import { MidiaModule } from './modules/midia/midia.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
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
    MessagesModule,
    DisparosModule,
    CadencesModule,
    FreelaModule,
    MidiaModule,
    IndicatorsModule,
    NotificationsModule,
    CampoModule,
    AreasModule,
  ],
  providers: [
    // Não é APP_GUARD: o `JwtAuthGuard` global delega para ele nas rotas
    // `@CampoRoute()` (sessão do consultor de campo, `aud: "campo"`).
    CampoAuthGuard,
    // Subclasse do ThrottlerGuard: o teto do formulário público vem do
    // ambiente (`PUBLIC_LEADS_PER_MINUTE`), o resto continua no balde de 300/min.
    { provide: APP_GUARD, useClass: AppThrottlerGuard },
    // Depois do Throttler: barra abuso de tráfego antes de gastar CPU
    // verificando token. Global — rotas ficam fechadas por padrão, `@Public()`
    // é a exceção explícita.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
