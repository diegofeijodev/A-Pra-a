/**
 * Relógio único do CRM automático (arquitetura §2.8). O `@Cron` não lê configuração: bate a cada 5 minutos (Brasília) e decide
 * aqui qual trabalho roda agora: A2 (etapas pelos cadastros) de hora em hora das 06h às 23h; A3 (quadro do Freela) nas horas
 * pares das 08h às 20h; A4 ("sem resposta" → Perdido) uma vez por dia a partir das 06:10, mais a limpeza das rodadas antigas.
 * Cada trabalho confere a própria chave ANTES de qualquer consulta: com tudo desligado não há ida ao banco. A hora-alvo já
 * rodada fica só em memória (reinício dentro da mesma hora pode repetir: os serviços são idempotentes); a A4 consulta a rodada
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

/** O tick de 5 em 5 minutos que cai no início da hora (minutos 0..4). */
const INICIO_DA_HORA_MIN = 5;
/** A4 só a partir das 06:10 de Brasília. */
const A4_A_PARTIR_DE_MIN = 6 * 60 + 10;

@Injectable()
export class CrmScheduler {
  private readonly log = new Logger(CrmScheduler.name);
  private readonly rodando: Record<Trabalho, boolean> = { etapas: false, quadro: false, sem_resposta: false };
  /** Última hora-alvo (`'2026-10-28T10'`, Brasília) em que o trabalho rodou. */
  private readonly ultimoSlot: Record<'etapas' | 'quadro', string | null> = { etapas: null, quadro: null };
  private limpezaNoDia: string | null = null;

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
      const noInicio = minutesSp(agora) % 60 < INICIO_DA_HORA_MIN;
      const slot = `${todaySp(agora)}T${String(hora).padStart(2, '0')}`;
      await Promise.all([
        this.rodarNaHora('etapas', !!this.crm?.auto_stages && noInicio && hora >= 6 && hora <= 23, slot, () => this.etapas.passadaCadastros(agora)),
        this.rodarNaHora('quadro', !!this.crm?.freela_pipeline && noInicio && hora >= 8 && hora <= 20 && hora % 2 === 0, slot, () => this.quadro.rodar(agora)),
        this.rodarSemResposta(agora),
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
    this.rodando.sem_resposta = true;
    try {
      const dia = todaySp(agora);
      if (await rodadaOkNoDia(this.prisma, 'sem_resposta', dia)) return;
      try {
        await this.semResposta.rodar(agora);
      } catch (e) {
        this.falhou('sem_resposta', e);
      }
      if (this.limpezaNoDia !== dia) {
        this.limpezaNoDia = dia;
        await limparRodadasAntigas(this.prisma, agora);
      }
    } catch (e) {
      this.falhou('sem_resposta', e);
    } finally {
      this.rodando.sem_resposta = false;
    }
  }

  private falhou(trabalho: string, e: unknown): void {
    this.log.error(`rodada do CRM (${trabalho}) falhou: ${e instanceof Error ? e.constructor.name : 'erro'}`);
  }
}
