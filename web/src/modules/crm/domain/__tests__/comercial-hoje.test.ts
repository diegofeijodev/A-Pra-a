import { describe, expect, it } from 'vitest';
import type { ResumoCrmView } from '../../infrastructure/crm.api';
import {
  estadoDoCartao,
  fonteDoCartao,
  linhaDeTarefas,
  linhasDoResumoCartao,
  rotuloAbrirTarefas,
  somarGrupos,
  subtituloDoCartao,
} from '../comercial-hoje';

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
  it('subtítulo com o dia, a praça e o aviso de período (só onde há o seletor de período)', () => {
    expect(subtituloDoCartao('2026-10-28', null, true)).toBe('qua 28/10 · todas as praças · não segue o período acima');
    expect(subtituloDoCartao('2026-10-28', 'BH', true)).toBe('qua 28/10 · BH · não segue o período acima');
    // `/inicio` sem o painel não tem período acima.
    expect(subtituloDoCartao('2026-10-28', null, false)).toBe('qua 28/10 · todas as praças');
  });
  it('número só com tudo lido: sem a lista de praças não há "0" (a soma seria de nenhuma praça)', () => {
    const ok = { pronto: true, erro: false };
    // A lista de praças falhou: nenhuma consulta de tarefas sai, e a soma vazia daria 0.
    expect(estadoDoCartao({ pracas: { pronta: false, erro: true }, resumo: ok, tarefas: [] })).toBe('erro');
    expect(estadoDoCartao({ pracas: { pronta: false, erro: false }, resumo: ok, tarefas: [] })).toBe('carregando');
    // Praças lidas e nenhuma praça: 0 de verdade.
    expect(estadoDoCartao({ pracas: { pronta: true, erro: false }, resumo: ok, tarefas: [] })).toBe('pronto');
    expect(
      estadoDoCartao({ pracas: { pronta: true, erro: false }, resumo: ok, tarefas: [{ pronta: true, erro: false }, { pronta: false, erro: true }] }),
    ).toBe('erro');
    expect(estadoDoCartao({ pracas: { pronta: true, erro: false }, resumo: { pronto: false, erro: false }, tarefas: [] })).toBe('carregando');
    // Uma releitura que falhou depois de tudo lido não apaga os números.
    expect(estadoDoCartao({ pracas: { pronta: true, erro: true }, resumo: { pronto: true, erro: true }, tarefas: [] })).toBe('pronto');
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
  it('UX final, achado 6: com "todas" e mais de uma praça, a conta diz quantas e que Tarefas mostra uma por vez', () => {
    const g = [{ task: 'send' as const, total: 4 }, { task: 'stalled' as const, total: 2 }];
    expect(linhaDeTarefas(g, { pracas: 3 }).conta).toBe(
      '4 mensagens + 2 conversas paradas, em 3 praças; a tela Tarefas mostra uma praça por vez.',
    );
    expect(linhaDeTarefas([], { pracas: 3 }).conta).toBe('Nenhuma tarefa para hoje em 3 praças.');
    // Uma praça só (ou o cartão de uma praça): a conta de antes.
    expect(linhaDeTarefas(g, { pracas: 1 }).conta).toBe('4 mensagens + 2 conversas paradas');
    expect(linhaDeTarefas(g).conta).toBe('4 mensagens + 2 conversas paradas');
  });
  it('UX final, achado 6: o botão diz de qual praça é a Tarefas que abre quando não é a do cartão', () => {
    const ativa = { id: 'p-bh', name: 'BH' };
    expect(rotuloAbrirTarefas({ pracaId: null, ativa, pracas: 3 })).toBe('Abrir tarefas de BH');
    expect(rotuloAbrirTarefas({ pracaId: null, ativa, pracas: 1 })).toBe('Abrir tarefas');
    expect(rotuloAbrirTarefas({ pracaId: 'p-bh', ativa, pracas: 3 })).toBe('Abrir tarefas');
    // O painel do gestor com outra praça escolhida: Tarefas abre a ativa, e o botão diz qual.
    expect(rotuloAbrirTarefas({ pracaId: 'p-sp', ativa, pracas: 3 })).toBe('Abrir tarefas de BH');
    expect(rotuloAbrirTarefas({ pracaId: null, ativa: undefined, pracas: 0 })).toBe('Abrir tarefas');
  });
});
