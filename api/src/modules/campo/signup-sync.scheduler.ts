/**
 * Relógio do sync de cadastros confirmados (F7, §27.3). O `@Cron` não lê configuração, então bate a
 * cada minuto e decide aqui: flag, Freela configurado, janela 06:00–23:59 de Brasília e intervalo
 * mínimo. A API roda em UMA instância (README); mesmo se duas rodassem, o UNIQUE e a escrita única
 * tornam o sync idempotente. O erro NUNCA sai do @Cron.
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { minutesSp } from '../../common/time/dates';
import { FreelaClient } from '../freela/freela-client';
import { SignupSyncService } from './signup-sync.service';
import { SIGNUP_SYNC_OPCOES, type OpcoesSignupSync } from './signup-sync.tokens';

@Injectable()
export class SignupSyncScheduler {
  private readonly log = new Logger(SignupSyncScheduler.name);
  private rodando = false;
  private ultima: Date | null = null;

  constructor(
    private readonly sync: SignupSyncService,
    private readonly client: FreelaClient,
    @Inject(SIGNUP_SYNC_OPCOES) private readonly opcoes: OpcoesSignupSync,
  ) {}

  @Cron('* * * * *', { timeZone: 'America/Sao_Paulo' })
  async tick(agora: Date = new Date()): Promise<void> {
    if (!this.opcoes.ligado) return;
    if (!this.client.isConfigured()) return;
    if (this.rodando) return;
    if (minutesSp(agora) < 6 * 60) return;
    if (this.ultima && agora.getTime() - this.ultima.getTime() < this.opcoes.intervaloMin * 60_000) return;
    this.rodando = true;
    this.ultima = agora;
    try {
      const r = await this.sync.rodar(agora, { janelaDias: this.opcoes.janelaDias });
      if (r.itens > 0 || r.erros > 0) {
        this.log.log(`cadastros do Freela: ${r.consultores} consultor(es), ${r.itens} item(ns), ${r.erros} com erro${r.interrompido429 ? ', rodada interrompida por limite (429)' : ''}`);
      }
    } catch (e) {
      this.log.error(`rodada de cadastros do Freela falhou: ${e instanceof Error ? e.constructor.name : 'erro'}`);
    } finally {
      this.rodando = false;
    }
  }
}
