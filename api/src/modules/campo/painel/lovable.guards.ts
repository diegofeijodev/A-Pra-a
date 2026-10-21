import { CanActivate, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { LOVABLE_A_FLAGS, type FlagsLovableA } from '../../rotas/rotas.tokens';

/*
 * Restante da Lovable, lote A (contrato §33.1, §34): flag desligada = 404 em todas as rotas do módulo. O guard global
 * (sessão) roda antes: token de consultor numa rota da equipe continua `401`.
 */

@Injectable()
export class DashboardLigadoGuard implements CanActivate {
  constructor(@Inject(LOVABLE_A_FLAGS) private readonly flags: FlagsLovableA) {}
  canActivate(): boolean {
    if (!this.flags.dashboard) throw new NotFoundException({ code: 'DASHBOARD_DISABLED', message: 'O painel do gestor não está habilitado neste servidor.' });
    return true;
  }
}

@Injectable()
export class DaySummaryLigadoGuard implements CanActivate {
  constructor(@Inject(LOVABLE_A_FLAGS) private readonly flags: FlagsLovableA) {}
  canActivate(): boolean {
    if (!this.flags.day_summary) throw new NotFoundException({ code: 'DAY_SUMMARY_DISABLED', message: 'O resumo do dia não está habilitado neste servidor.' });
    return true;
  }
}

@Injectable()
export class MapPinsLigadoGuard implements CanActivate {
  constructor(@Inject(LOVABLE_A_FLAGS) private readonly flags: FlagsLovableA) {}
  canActivate(): boolean {
    if (!this.flags.map_pins) throw new NotFoundException({ code: 'MAP_PINS_DISABLED', message: 'O mapa por situação não está habilitado neste servidor.' });
    return true;
  }
}
