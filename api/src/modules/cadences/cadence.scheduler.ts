/**
 * O relógio que chama o motor das cadências.
 *
 * No protótipo o `tick` era um `setInterval` na aba aberta do navegador: fechou
 * a aba, a cadência parava. Aqui é `@Cron` no servidor, a cada 15 segundos —
 * curto porque o "Testar comigo" comprime dias em segundos e precisa ver a
 * trilha andar na tela.
 *
 * Duas travas: `CADENCE_ENGINE_ENABLED` (desliga tudo sem mexer no código, para
 * quando o motor precisar ficar parado em produção) e a de reentrância — uma
 * rodada lenta não pode ter a próxima entrando por cima, mandando a mesma
 * mensagem duas vezes.
 */
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CadenceEngineService } from './cadence-engine.service';

@Injectable()
export class CadenceScheduler {
  private readonly log = new Logger(CadenceScheduler.name);
  private rodando = false;

  constructor(private readonly engine: CadenceEngineService) {}

  @Cron('*/15 * * * * *')
  async tick(): Promise<void> {
    if (process.env.CADENCE_ENGINE_ENABLED !== 'true') return;
    if (this.rodando) return;
    this.rodando = true;
    try {
      await this.engine.tick(new Date());
    } catch (e) {
      // Erro NUNCA sai do cron: exceção não tratada aqui derruba o processo do
      // Nest e para a API inteira por causa de uma cadência mal montada.
      this.log.error(`rodada das cadências falhou: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      this.rodando = false;
    }
  }
}
