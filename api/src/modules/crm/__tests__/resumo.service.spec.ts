import type { PrismaService } from '../../../common/database/prisma.service';
import type { FreelaClient } from '../../freela/freela-client';
import { ResumoService } from '../resumo.service';

const PRACA = 'aaaaaaaa-0000-4000-8000-000000000001';
// 28/10 12:00 em Brasília.
const AGORA = new Date('2026-10-28T15:00:00.000Z');

type Row = Record<string, any>;

function montar(o: { freela?: boolean; rodada?: Row | null; origens?: Row[]; eventos?: Row[]; enviadas?: Row[]; respostas?: number } = {}) {
  const chamadas: Record<string, Row[]> = {};
  const reg = (k: string, a: Row) => (chamadas[k] = [...(chamadas[k] ?? []), a]);
  const prisma: any = {
    leads: { groupBy: jest.fn(async (a: Row) => (reg('leads', a), o.origens ?? [])) },
    lead_events: { findMany: jest.fn(async (a: Row) => (reg('events', a), o.eventos ?? [])) },
    msg_sends: {
      groupBy: jest.fn(async (a: Row) => (reg('envios', a), o.enviadas ?? [])),
      count: jest.fn(async (a: Row) => (reg('respostas', a), o.respostas ?? 0)),
    },
    crm_automation_runs: { findFirst: jest.fn(async () => (o.rodada === undefined ? null : o.rodada)) },
  };
  const freela = { isConfigured: () => o.freela ?? true } as unknown as FreelaClient;
  return { svc: new ResumoService(prisma as PrismaService, freela), chamadas };
}
const chave = (r: { numbers: { key: string }[] }, k: string) => r.numbers.find((n) => n.key === k) as any;

describe('ResumoService.resumo', () => {
  it('padrão: hoje de Brasília e todas as praças; a janela do dia vai em todas as consultas', async () => {
    const { svc, chamadas } = montar();
    const r = await svc.resumo(undefined, undefined, AGORA);
    expect(r).toMatchObject({ day: '2026-10-28', praca_id: null, freela_configured: true, freela_read_at: null });
    const janela = { gte: new Date('2026-10-28T03:00:00.000Z'), lt: new Date('2026-10-29T03:00:00.000Z') };
    expect(chamadas.leads![0]!.where).toEqual({ created_at: janela, is_test: false, archived: false });
    expect(chamadas.events![0]!.where).toEqual({ at: janela, stage_to: { not: null }, lead: { is_test: false } });
    expect(chamadas.envios![0]!.where).toEqual({ sent_at: janela, lead: { is_test: false } });
    expect(chamadas.respostas![0]!.where).toEqual({ replied_at: janela, lead: { is_test: false } });
  });

  it('com praca_id filtra as consultas por ela', async () => {
    const { svc, chamadas } = montar();
    const r = await svc.resumo(PRACA, '2026-10-27', AGORA);
    expect(r.praca_id).toBe(PRACA);
    expect(r.day).toBe('2026-10-27');
    expect(chamadas.leads![0]!.where.praca_id).toBe(PRACA);
    expect(chamadas.events![0]!.where.lead).toEqual({ is_test: false, praca_id: PRACA });
    expect(chamadas.envios![0]!.where.lead).toEqual({ is_test: false, praca_id: PRACA });
  });

  it('Freela não configurado: números do Freela com value null e sem leitura', async () => {
    const { svc } = montar({ freela: false, eventos: [{ stage_to: 5, author_id: null, author_label: 'Automático · Freela' }] });
    const r = await svc.resumo(PRACA, '2026-10-28', AGORA);
    expect(r.freela_configured).toBe(false);
    expect(chave(r, 'freela').value).toBeNull();
    expect(r.freela_read_at).toBeNull();
  });

  it('freela_read_at = finished_at da última rodada ok com leitura de verdade; nao_configurado não vale', async () => {
    const fim = new Date('2026-10-28T17:00:12.000Z'); // 14h00 em Brasília
    const a = montar({ rodada: { ok: true, finished_at: fim, summary: {} } });
    const ra = await a.svc.resumo(PRACA, '2026-10-28', AGORA);
    expect(ra.freela_read_at).toBe(fim.toISOString());
    expect(chave(ra, 'freela').source).toContain('lido às 14h00');
    for (const rodada of [
      { ok: true, finished_at: fim, summary: { nao_configurado: true } },
      { ok: false, finished_at: fim, summary: {} },
      { ok: true, finished_at: null, summary: {} },
    ]) {
      const b = montar({ rodada });
      expect((await b.svc.resumo(PRACA, '2026-10-28', AGORA)).freela_read_at).toBeNull();
    }
  });

  it('monta os números com a conta a partir do que o banco devolveu', async () => {
    const { svc } = montar({
      origens: [
        { origem: 'pesquisa automática', _count: { _all: 8 } },
        { origem: 'visita de campo', _count: { _all: 3 } },
        { origem: 'orgânico', _count: { _all: 1 } },
      ],
      eventos: [{ stage_to: 5, author_id: null, author_label: 'Automático · Freela' }, { stage_to: 3, author_id: 'u1', author_label: null }],
      enviadas: [{ mode: 'freela', _count: { _all: 3 } }, { mode: 'fila', _count: { _all: 1 } }],
      respostas: 2,
    });
    const r = await svc.resumo(PRACA, '2026-10-27', AGORA);
    expect(chave(r, 'leads_novos').formula).toBe('12 = 8 da busca + 3 de visitas + 1 do formulário');
    expect(chave(r, 'mudancas_etapa').formula).toBe('2 = 1 automáticas + 1 da equipe');
    expect(chave(r, 'freela').formula).toBe('1 = 1 cadastros + 0 primeira contratação + 0 clientes ativos');
    expect(chave(r, 'mensagens_enviadas').formula).toBe('4 = 3 entregues ao Freela + 1 marcadas à mão');
    expect(chave(r, 'respostas').value).toBe(2);
  });
});
