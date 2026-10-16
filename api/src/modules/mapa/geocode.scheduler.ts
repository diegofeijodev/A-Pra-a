/**
 * Relógio da geocodificação (§21.2): a cada minuto, um lote da fila. Processo
 * único (README, "Produção"). O erro NUNCA sai do @Cron: exceção não tratada
 * derruba o processo.
 */
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { GeocodeService } from './geocode.service';

@Injectable()
export class GeocodeScheduler {
  private readonly log = new Logger(GeocodeScheduler.name);
  private rodando = false;

  constructor(private readonly geo: GeocodeService) {}

  @Cron('30 * * * * *')
  async tick(): Promise<void> {
    if (this.rodando) return;
    this.rodando = true;
    try {
      const r = await this.geo.rodada();
      if (r.ok || r.falhou) this.log.log(`geocodificação: ${r.ok} localizado(s), ${r.falhou} sem endereço achado`);
    } catch (e) {
      this.log.error(`geocodificação falhou: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      this.rodando = false;
    }
  }
}
