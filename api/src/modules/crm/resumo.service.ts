/**
 * CRM automático — resumo do dia (contrato §47.3, arquitetura achado 12). Carrega as linhas do dia de Brasília em poucas consultas
 * agregadas e entrega à `montarResumo` (regras puras): cada número sai com as partes, a conta e a fonte.
 *
 * Decisões: leads novos = criados no dia, sem `is_test` e SEM arquivados (é o que a tela promete na fonte); eventos e mensagens
 * ignoram só lead de teste (o que aconteceu, aconteceu, mesmo que o lead tenha sido arquivado depois). Sem `praca_id` = todas as praças.
 */
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { minutesSp, todaySp } from '../../common/time/dates';
import { janelaDoDia, montarResumo, type NumeroResumo } from '../../domain/crm-resumo-rules';
import { FreelaClient } from '../freela/freela-client';
import { ultimaRodada } from './rodadas';

export interface RespostaResumo {
  day: string;
  praca_id: string | null;
  freela_configured: boolean;
  freela_read_at: string | null;
  numbers: NumeroResumo[];
}

/** 17:00Z -> "14h00" (Brasília). */
function horaCurta(d: Date): string {
  const m = minutesSp(d);
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;
}

@Injectable()
export class ResumoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly freela: FreelaClient,
  ) {}

  async resumo(pracaId: string | undefined, day: string | undefined, agora: Date = new Date()): Promise<RespostaResumo> {
    const dia = day ?? todaySp(agora);
    const { from, to } = janelaDoDia(dia);
    const janela = (campo: string) => ({ [campo]: { gte: from, lt: to } });
    const doLead: Prisma.leadsWhereInput = { is_test: false, ...(pracaId ? { praca_id: pracaId } : {}) };
    const configurado = this.freela.isConfigured();

    // Fora do Freela, a cadência marca sozinha e o disparo é marcado à mão (UX final, achado 3): contagens separadas.
    const foraDoFreela = { ...janela('sent_at'), mode: { not: 'freela' } };
    const [origens, eventos, enviadas, respostas, rodada, enviadasCadencia, enviadasDisparo] = await Promise.all([
      this.prisma.leads.groupBy({
        by: ['origem'],
        where: { ...janela('created_at'), ...doLead, archived: false },
        _count: { _all: true },
      }),
      this.prisma.lead_events.findMany({
        where: { ...janela('at'), stage_to: { not: null }, lead: doLead },
        select: { author_id: true, author_label: true, stage_to: true },
      }),
      this.prisma.msg_sends.groupBy({ by: ['mode'], where: { ...janela('sent_at'), lead: doLead }, _count: { _all: true } }),
      this.prisma.msg_sends.count({ where: { ...janela('replied_at'), lead: doLead } }),
      ultimaRodada(this.prisma, 'quadro_freela'),
      this.prisma.msg_sends.count({ where: { ...foraDoFreela, cadence_id: { not: null }, lead: doLead } }),
      this.prisma.msg_sends.count({ where: { ...foraDoFreela, cadence_id: null, disparo_id: { not: null }, lead: doLead } }),
    ]);

    // Leitura "de verdade": rodada ok, terminada e que não foi o "sem conexão" (decisão do controlador).
    const sumario = (rodada?.summary ?? {}) as { nao_configurado?: unknown };
    const lido = rodada && rodada.ok && rodada.finished_at && sumario.nao_configurado !== true ? rodada.finished_at : null;

    const leadsPorOrigem: Record<string, number> = {};
    for (const o of origens) leadsPorOrigem[o.origem] = (leadsPorOrigem[o.origem] ?? 0) + o._count._all;

    const { numbers } = montarResumo(
      {
        leadsPorOrigem,
        eventosEtapa: eventos.map((e) => ({ author_id: e.author_id, author_label: e.author_label, stage_to: e.stage_to as number })),
        freelaConfigurado: configurado,
        freelaLidoEm: lido ? horaCurta(lido) : null,
        enviadas: enviadas.map((m) => ({ mode: m.mode, n: m._count._all })),
        enviadasCadencia,
        enviadasDisparo,
        respostas,
      },
      dia,
    );
    return {
      day: dia,
      praca_id: pracaId ?? null,
      freela_configured: configurado,
      freela_read_at: configurado && lido ? lido.toISOString() : null,
      numbers,
    };
  }
}
