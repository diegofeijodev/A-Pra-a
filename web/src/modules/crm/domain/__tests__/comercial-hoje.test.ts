import { describe, expect, it } from 'vitest';
import type { ResumoCrmView } from '../../infrastructure/crm.api';
import { fonteDoCartao, linhaDeTarefas, linhasDoResumoCartao, somarGrupos, subtituloDoCartao } from '../comercial-hoje';

const r = (leads: number, etapas: number): ResumoCrmView => ({
  day: '2026-10-28',
  praca_id: null,
  freela_configured: true,
  freela_read_at: null,
  numbers: [
    { key: 'leads_novos', value: leads, parts: [], formula: `${leads} = 8 da busca automática + 4 de visitas`, source: 's' },
    { key: 'mudancas_etapa', value: etapas, parts: [], formula: `${etapas} = 5 automáticas + 2 da equipe`, source: 's' },
  ],
});

describe('Comercial hoje', () => {
  it('subtítulo com o dia, a praça e o aviso de período', () => {
    expect(subtituloDoCartao('2026-10-28', null)).toBe('qua 28/10 · todas as praças · não segue o período acima');
    expect(subtituloDoCartao('2026-10-28', 'BH')).toBe('qua 28/10 · BH · não segue o período acima');
  });
  it('tarefas somam as praças e a conta fica por grupo; cadência não entra', () => {
    const g = somarGrupos([
      [{ task: 'send', total: 3 }, { task: 'cadence_send', total: 9 }],
      [{ task: 'send', total: 1 }, { task: 'stalled', total: 2 }, { task: 'next_step', total: 3 }],
    ]);
    expect(linhaDeTarefas(g)).toEqual({ chave: 'tarefas', rotulo: 'Tarefas para hoje', numero: '9', conta: '4 mensagens + 3 próximos passos + 2 conversas paradas' });
  });
  it('zero tarefas', () => {
    expect(linhaDeTarefas([])).toMatchObject({ numero: '0', conta: 'Nenhuma tarefa para hoje.' });
  });
  it('leads novos e mudanças de etapa, com a conta da API; zero vira a frase do dia', () => {
    expect(linhasDoResumoCartao(r(12, 7)).map((l) => [l.rotulo, l.numero, l.conta])).toEqual([
      ['Leads novos', '12', '12 = 8 da busca automática + 4 de visitas'],
      ['Mudanças de etapa', '7', '7 = 5 automáticas + 2 da equipe'],
    ]);
    expect(linhasDoResumoCartao(r(0, 0)).map((l) => l.conta)).toEqual(['Nenhum lead criado hoje.', 'Nenhum lead mudou de etapa hoje.']);
  });
  it('fonte com a hora da leitura das tarefas', () => {
    const t = fonteDoCartao('2026-10-28', new Date('2026-10-28T17:32:00Z'));
    expect(t).toContain('calculadas agora, às 14h32');
    expect(t).toContain('em 28/10, dia de Brasília, sem os de teste');
    expect(fonteDoCartao('2026-10-28', null)).toContain('calculadas agora, pela mesma regra');
  });
});
