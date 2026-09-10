/**
 * O relógio da integração com o Freela — §7.6.
 *
 * A cada 2 minutos: entrega o que venceu (outbox) e traz de volta o que o
 * Freela já mandou (status das campanhas, destinatários enviados/falhados). Dois
 * minutos porque o despachante do Freela roda a cada minuto e manda 1 mensagem
 * por campanha por tick — sincronizar mais rápido só gastaria chamada.
 *
 * Três travas, pelos mesmos motivos do relógio das cadências:
 * `FREELA_SYNC_ENABLED` (desliga sem mexer no código), conexão configurada
 * (sem ela não há o que sincronizar) e reentrância (uma rodada lenta não pode
 * ter a próxima entrando por cima e criando a campanha duas vezes). E o erro
 * **nunca** sai daqui: exceção não tratada em `@Cron` derruba o processo.
 */
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { FreelaCampaignsService } from './freela-campaigns.service';
import { FreelaClient } from './freela-client';
import { FreelaOutboxService } from './freela-outbox.service';

@Injectable()
export class FreelaSyncScheduler {
  private readonly log = new Logger(FreelaSyncScheduler.name);
  private rodando = false;

  constructor(
    private readonly client: FreelaClient,
    private readonly outbox: FreelaOutboxService,
    private readonly campaigns: FreelaCampaignsService,
  ) {}

  @Cron('*/2 * * * *')
  async tick(): Promise<void> {
    if (!this.client.syncEnabled()) return;
    if (!this.client.isConfigured()) return;
    if (this.rodando) return;
    this.rodando = true;
    try {
      const entregue = await this.outbox.flush(new Date());
      if (entregue.campaigns > 0 || entregue.failed > 0 || entregue.start_pending > 0) {
        this.log.log(
          `outbox: ${entregue.campaigns} campanha(s), ${entregue.sends} envio(s), ${entregue.failed} sem telefone, ${entregue.start_pending} esperando começar`,
        );
      }
      await this.campaigns.syncAll();
    } catch (e) {
      this.log.error(`rodada do Freela falhou: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      this.rodando = false;
    }
  }
}
