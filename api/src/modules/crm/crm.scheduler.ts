/**
 * Relógio único do CRM automático (arquitetura §2.8). O `@Cron` não lê configuração: bate a cada 5 minutos (Brasília) e decide
 * aqui qual trabalho roda agora: A2 (etapas pelos cadastros) de hora em hora das 06h às 23h; A3 (quadro do Freela) nas horas
 * pares das 08h às 20h; A4 ("sem resposta" → Perdido) uma vez por dia a partir das 06:10. A limpeza das rodadas antigas é à
 * parte: uma vez por dia (no 1º tique do dia), com QUALQUER chave do CRM ligada (achado 21), sem depender da A4.
 * Cada trabalho confere a própria chave ANTES de qualquer consulta: com tudo desligado não há ida ao banco. A hora-alvo já
 * rodada e o dia da limpeza ficam só em memória (reinício pode repetir: os serviços são idempotentes); a A4 consulta a rodada
 * do dia no banco e por isso sobrevive a reinício. O erro NUNCA sai do @Cron e o log leva só o nome da classe do erro.
 */
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../common/database/prisma.service';
import { CRM_FLAGS, type FlagsCrm } from '../../common/flags/crm.flags';
import { hourSp, minutesSp, todaySp } from '../../common/time/dates';
import { EtapasAutomaticasService } from './etapas-automaticas.service';
import { QuadroFreelaService } from './quadro-freela.service';
import { limparRodadasAntigas, rodadaOkNoDia } from './rodadas';
import { SemRespostaService } from './sem-resposta.service';

type Trabalho = 'etapas' | 'quadro' | 'sem_resposta';

/** Depois de uma tentativa da A4 que não fechou o dia (falha), espera isto antes de tentar de novo. */
const A4_ESPERA_APOS_FALHA_MS = 60 * 60_000;
/** A4 só a partir das 06:10 de Brasília. */
const A4_A_PARTIR_DE_MIN = 6 * 60 + 10;

@Injectable()
export class CrmScheduler {
  private readonly log = new Logger(CrmScheduler.name);
  private readonly rodando: Record<Trabalho, boolean> = { etapas: false, quadro: false, sem_resposta: false };
  /** Última hora-alvo (`'2026-10-28T10'`, Brasília) em que o trabalho rodou. */
  private readonly ultimoSlot: Record<'etapas' | 'quadro', string | null> = { etapas: null, quadro: null };
  private limpezaNoDia: string | null = null;
  private ultimaTentativaA4: Date | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly etapas: EtapasAutomaticasService,
    private readonly quadro: QuadroFreelaService,
    private readonly semResposta: SemRespostaService,
    @Optional() @Inject(CRM_FLAGS) private readonly crm?: FlagsCrm,
  ) {}

  @Cron('*/5 * * * *', { timeZone: 'America/Sao_Paulo' })
  async bater(agora: Date = new Date()): Promise<void> {
    try {
      const hora = hourSp(agora);
      const slot = `${todaySp(agora)}T${String(hora).padStart(2, '0')}`;
      await Promise.all([
        this.rodarNaHora('etapas', !!this.crm?.auto_stages && hora >= 6 && hora <= 23, slot, () => this.etapas.passadaCadastros(agora)),
        this.rodarNaHora('quadro', !!this.crm?.freela_pipeline && hora >= 8 && hora <= 20 && hora % 2 === 0, slot, () => this.quadro.rodar(agora)),
        this.rodarSemResposta(agora),
        this.limparNoDia(agora),
      ]);
    } catch (e) {
      this.falhou('bater', e);
    }
  }

  private async rodarNaHora(job: 'etapas' | 'quadro', devido: boolean, slot: string, executar: () => Promise<unknown>): Promise<void> {
    if (!devido || this.rodando[job] || this.ultimoSlot[job] === slot) return;
    this.rodando[job] = true;
    this.ultimoSlot[job] = slot;
    try {
      await executar();
    } catch (e) {
      this.falhou(job, e);
    } finally {
      this.rodando[job] = false;
    }
  }

  private async rodarSemResposta(agora: Date): Promise<void> {
    if (!this.crm?.auto_lost || this.rodando.sem_resposta || minutesSp(agora) < A4_A_PARTIR_DE_MIN) return;
    if (this.ultimaTentativaA4 && agora.getTime() - this.ultimaTentativaA4.getTime() < A4_ESPERA_APOS_FALHA_MS) return;
    this.rodando.sem_resposta = true;
    try {
      const dia = todaySp(agora);
      if (await rodadaOkNoDia(this.prisma, 'sem_resposta', dia)) return;
      this.ultimaTentativaA4 = agora;
      await this.semResposta.rodar(agora);
    } catch (e) {
      this.falhou('sem_resposta', e);
    } finally {
      this.rodando.sem_resposta = false;
    }
  }

  /** Rodadas com mais de 30 dias: uma vez por dia (marca em memória antes de apagar), com qualquer chave do CRM ligada. */
  private async limparNoDia(agora: Date): Promise<void> {
    const c = this.crm;
    if (!c || !(c.auto_leads || c.auto_stages || c.auto_lost || c.freela_pipeline)) return;
    const dia = todaySp(agora);
    if (this.limpezaNoDia === dia) return;
    this.limpezaNoDia = dia;
    try {
      await limparRodadasAntigas(this.prisma, agora);
    } catch (e) {
      this.falhou('limpeza', e);
    }
  }

  private falhou(trabalho: string, e: unknown): void {
    this.log.error(`rodada do CRM (${trabalho}) falhou: ${e instanceof Error ? e.constructor.name : 'erro'}`);
  }
}
