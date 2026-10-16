/**
 * Relógio da segunda-feira (§21.5): às 7h de Brasília (antes das 9h, quando a
 * rota começa) abre a semana — segunda a sábado — de quem ainda não tem rota
 * nela. Processo único (README, "Produção"). `FIELD_ROUTES_ENABLED=false`
 * desliga. O erro NUNCA sai do @Cron: exceção não tratada derruba o processo.
 */
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { RoutesService } from './routes.service';

@Injectable()
export class RoutesScheduler {
  private readonly log = new Logger(RoutesScheduler.name);
  private rodando = false;

  constructor(private readonly routes: RoutesService) {}

  @Cron('0 7 * * 1', { timeZone: 'America/Sao_Paulo' })
  async tick(agora = new Date()): Promise<void> {
    if ((process.env.FIELD_ROUTES_ENABLED ?? 'true') === 'false' || this.rodando) return;
    this.rodando = true;
    try {
      const n = await this.routes.generateMonday(agora);
      if (n > 0) this.log.log(`segunda-feira: ${n} rota(s) da semana abertas`);
    } catch (e) {
      this.routes.logErro(e);
    } finally {
      this.rodando = false;
    }
  }
}
