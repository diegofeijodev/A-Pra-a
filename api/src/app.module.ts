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
import { LovableEFlagsModule } from './common/flags/lovable-e.flags';
import { CrmFlagsModule } from './common/flags/crm.flags';
import { UiFlagsModule } from './common/flags/ui.flags';
import { PracasDoConsultorModule } from './common/pracas/pracas-do-consultor.module';
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
import { PasswordPolicyModule } from './modules/password-policy/password-policy.module';
import { PlacesModule } from './modules/places/places.module';
import { PracasModule } from './modules/pracas/pracas.module';
import { RotasModule } from './modules/rotas/rotas.module';
import { PublicModule } from './modules/public/public.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    ScheduleModule.forRoot(),
    PrismaModule,
    // Lote E da Lovable (contrato §41/§42): flags transversais (guarda global, pessoas, campo).
    LovableEFlagsModule,
    // Casca da Lovable (contrato §46): as flags de navegação do menu da equipe (só leitura).
    UiFlagsModule,
    CrmFlagsModule,
    // Lote F2 da Lovable (contrato §44): consultor em várias praças (o guard do campo e vários módulos leem o conjunto).
    PracasDoConsultorModule,
    PasswordPolicyModule,
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
    PlacesModule,
    RotasModule,
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
