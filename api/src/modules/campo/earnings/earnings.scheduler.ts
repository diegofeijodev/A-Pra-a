/**
 * Fechamento semanal automático (F8, contrato §28.7). O `@Cron` não lê configuração: bate a cada 30 min e
 * decide no código (dia do Pix e hora da regra vigente). A API roda em UMA instância; mesmo com duas, o
 * `UNIQUE` do fechamento e a chave de idempotência do razão impedem duplicar. O erro NUNCA sai do @Cron.
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { todaySp } from '../../../common/time/dates';
import { EarningsService } from './earnings.service';
import { EARNINGS_OPCOES, type OpcoesEarnings } from './earnings.tokens';

@Injectable()
export class EarningsScheduler {
  private readonly log = new Logger(EarningsScheduler.name);
  private rodando = false;
  private diaFeito: string | null = null;

  constructor(
    private readonly earnings: EarningsService,
    @Inject(EARNINGS_OPCOES) private readonly opcoes: OpcoesEarnings,
  ) {}

  @Cron('0,30 * * * *', { timeZone: 'America/Sao_Paulo' })
  async tick(agora: Date = new Date()): Promise<void> {
    if (!this.opcoes.autoClose) return;
    if (this.rodando) return;
    this.rodando = true;
    try {
      const dia = todaySp(agora);
      if (this.diaFeito === dia) return;
      if (!(await this.earnings.deveFecharAgora(agora))) return;
      const r = await this.earnings.fecharEncerradas(agora);
      this.diaFeito = dia;
      this.log.log(`fechamento automático: ${r.fechados} fechamento(s) em ${r.semanas} semana(s), ${r.tardios} lançamento(s) tardio(s)`);
    } catch (e) {
      this.log.error(`fechamento automático falhou: ${e instanceof Error ? e.constructor.name : 'erro'}`);
    } finally {
      this.rodando = false;
    }
  }
}
