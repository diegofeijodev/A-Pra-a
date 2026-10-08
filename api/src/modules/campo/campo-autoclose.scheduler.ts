/**
 * Fechamento da meia-noite (spec §7): 00:05 de Brasília. A API roda em UMA
 * instância (README, "Produção") — com duas, as duas fechariam o mesmo dia
 * (inofensivo aqui: o update é condicional), mas a premissa vale para todo relógio.
 * O erro NUNCA sai do @Cron: exceção não tratada derruba o processo.
 */
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { JourneysService } from './journeys.service';

@Injectable()
export class CampoAutocloseScheduler {
  private readonly log = new Logger(CampoAutocloseScheduler.name);
  private rodando = false;

  constructor(private readonly journeys: JourneysService) {}

  @Cron('5 0 * * *', { timeZone: 'America/Sao_Paulo' })
  async tick(): Promise<void> {
    if (this.rodando) return;
    this.rodando = true;
    try {
      const r = await this.journeys.closeStale(new Date());
      if (r.journeys > 0) {
        this.log.log(`meia-noite: ${r.journeys} jornada(s) e ${r.visits} visita(s) sem checkout fechadas`);
      }
    } catch (e) {
      this.log.error(`fechamento da meia-noite falhou: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      this.rodando = false;
    }
  }
}
