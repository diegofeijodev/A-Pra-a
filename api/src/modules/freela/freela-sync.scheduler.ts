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
import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CampoFreelaService } from '../campo/campo-freela.service';
import { VoucherCouponsService } from '../campo/vouchers/voucher-coupons.service';
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
    private readonly campoFreela: CampoFreelaService,
    /** Cupons da 1ª contratação (contrato §38.7): com a flag do cupom desligada, `rodada` não faz nada (nem consulta). */
    @Optional() private readonly cupons?: VoucherCouponsService,
  ) {}

  @Cron('*/2 * * * *')
  async tick(): Promise<void> {
    if (!this.client.syncEnabled()) return;
    if (!this.client.isConfigured()) {
      // Cupons (§38.7): sem a conexão, só o aviso "aguardando conexão com o Freela" (no máximo 1×/h). Nada chama o Freela.
      await this.cupons?.avisarSemConexao().catch(() => undefined);
      return;
    }
    if (this.rodando) return;
    this.rodando = true;
    try {
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
      }
      // Consultores de campo (spec §7): código pendente e ativar/desativar que
      // falhou. `try` próprio: o outbox caído não pode segurar o código do
      // consultor, e vice-versa.
      try {
        const n = await this.campoFreela.retryPending();
        if (n > 0) this.log.log(`campo: ${n} consultor(es) com o código do Freela pendente — tentado de novo`);
      } catch (e) {
        this.log.error(`código do Freela dos consultores falhou: ${e instanceof Error ? e.message : String(e)}`);
      }
      // Cupons da 1ª contratação (§38.7): vínculo automático, criação devida (até 20) e leitura do estado. `try` próprio.
      try {
        const r = await this.cupons?.rodada();
        if (r && (r.tentados > 0 || r.vinculados > 0 || r.lidos > 0)) {
          this.log.log(`cupons: ${r.criados} criado(s) de ${r.tentados} tentado(s), ${r.vinculados} vinculado(s), ${r.lidos} lido(s)`);
        }
      } catch (e) {
        this.log.error(`cupons da 1ª contratação falharam: ${e instanceof Error ? e.name : 'erro'}`);
      }
    } finally {
      this.rodando = false;
    }
  }
}
