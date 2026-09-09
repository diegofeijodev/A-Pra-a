import {
  firstPendingNode,
  isStep,
  matchesEntry,
  openedVaga,
  respondedSince,
  stepDueAt,
  stepIndexOf,
  stepNodes,
  type CadenceRuleNode,
  type EntryLead,
} from '../cadence-rules';

/** Os nós da "Prospecção de contratante — 3 toques" (protótipo). */
const NODES: CadenceRuleNode[] = [
  { id: 'n1', kind: 'msg', day: 0 },
  { id: 'n2', kind: 'cond', day: 0 },
  { id: 'n3', kind: 'msg', day: 2 },
  { id: 'n4', kind: 'cond', day: 0 },
  { id: 'n5', kind: 'task', day: 5 },
];

const lead = (over: Partial<EntryLead> = {}): EntryLead => ({ stage: 1, reheat_at: null, ...over });

describe('isStep / stepNodes', () => {
  it('passo é mensagem ou tarefa — condição não é passo', () => {
    expect(isStep({ kind: 'msg' })).toBe(true);
    expect(isStep({ kind: 'task' })).toBe(true);
    expect(isStep({ kind: 'cond' })).toBe(false);
  });

  it('stepNodes tira as condições e mantém a ordem', () => {
    expect(stepNodes(NODES).map((n) => n.id)).toEqual(['n1', 'n3', 'n5']);
  });
});

describe('respondedSince', () => {
  const since = '2026-09-09T12:00:00.000Z';

  it('resposta depois de entrar tira da cadência', () => {
    expect(respondedSince([{ kind: 'msg_in', at: '2026-09-09T13:00:00.000Z' }], since)).toBe(true);
  });

  it('resposta no mesmo instante conta (a comparação inclui o limite)', () => {
    expect(respondedSince([{ kind: 'msg_in', at: since }], since)).toBe(true);
  });

  it('resposta anterior à inscrição não conta', () => {
    expect(respondedSince([{ kind: 'msg_in', at: '2026-09-08T13:00:00.000Z' }], since)).toBe(false);
  });

  it('outro tipo de evento não é resposta', () => {
    expect(
      respondedSince(
        [
          { kind: 'msg_out', at: '2026-09-10T13:00:00.000Z' },
          { kind: 'call', at: '2026-09-10T13:00:00.000Z' },
          { kind: 'note', at: '2026-09-10T13:00:00.000Z' },
        ],
        since,
      ),
    ).toBe(false);
  });

  it('sem evento nenhum, não respondeu', () => {
    expect(respondedSince([], since)).toBe(false);
  });
});

describe('openedVaga', () => {
  const since = '2026-09-09T12:00:00.000Z';

  it('vaga a partir do dia da inscrição conta', () => {
    expect(openedVaga([{ date: '2026-09-09' }], 3, since)).toBe(true);
    expect(openedVaga([{ date: '2026-09-20' }], 3, since)).toBe(true);
  });

  it('vaga anterior à inscrição não conta', () => {
    expect(openedVaga([{ date: '2026-09-08' }], 3, since)).toBe(false);
  });

  it('etapa 6 ou acima já é vaga rodando, mesmo sem vaga na ficha', () => {
    expect(openedVaga([], 6, since)).toBe(true);
    expect(openedVaga([], 7, since)).toBe(true);
  });

  it('sem vaga e antes da etapa 6, não abriu vaga', () => {
    expect(openedVaga([], 5, since)).toBe(false);
  });
});

describe('matchesEntry', () => {
  const hoje = '2026-09-09';

  it('stage_novo pega quem está na etapa 1', () => {
    expect(matchesEntry('stage_novo', lead({ stage: 1 }), hoje)).toBe(true);
    expect(matchesEntry('stage_novo', lead({ stage: 2 }), hoje)).toBe(false);
  });

  it('reheat_due pega quem tem reaquecimento vencido ou de hoje', () => {
    expect(matchesEntry('reheat_due', lead({ reheat_at: '2026-09-01' }), hoje)).toBe(true);
    expect(matchesEntry('reheat_due', lead({ reheat_at: hoje }), hoje)).toBe(true);
    expect(matchesEntry('reheat_due', lead({ reheat_at: '2026-10-01' }), hoje)).toBe(false);
    expect(matchesEntry('reheat_due', lead({ reheat_at: null }), hoje)).toBe(false);
  });

  it('first_vaga pega quem está na etapa 6', () => {
    expect(matchesEntry('first_vaga', lead({ stage: 6 }), hoje)).toBe(true);
    expect(matchesEntry('first_vaga', lead({ stage: 7 }), hoje)).toBe(false);
  });

  it('praça, freelancer e manual entram na mão — o relógio não pega', () => {
    for (const r of ['praca_mapeamento', 'freela_first_turn', 'manual', 'inventada']) {
      expect(matchesEntry(r, lead({ stage: 1, reheat_at: hoje }), hoje)).toBe(false);
    }
  });
});

describe('stepDueAt', () => {
  const inicio = '2026-09-09T12:00:00.000Z';

  it('sem compressão, cada dia do nó é um dia de verdade', () => {
    expect(stepDueAt(inicio, 0)).toBe('2026-09-09T12:00:00.000Z');
    expect(stepDueAt(inicio, 2)).toBe('2026-09-11T12:00:00.000Z');
    expect(stepDueAt(inicio, 30)).toBe('2026-10-09T12:00:00.000Z');
  });

  it('com compressão, cada dia vira alguns segundos (o "Testar comigo")', () => {
    expect(stepDueAt(inicio, 0, 5)).toBe('2026-09-09T12:00:00.000Z');
    expect(stepDueAt(inicio, 2, 5)).toBe('2026-09-09T12:00:10.000Z');
    expect(stepDueAt(inicio, 9, 5)).toBe('2026-09-09T12:00:45.000Z');
  });

  it('compressão 0, null e undefined caem no dia de verdade', () => {
    expect(stepDueAt(inicio, 2, 0)).toBe('2026-09-11T12:00:00.000Z');
    expect(stepDueAt(inicio, 2, null)).toBe('2026-09-11T12:00:00.000Z');
    expect(stepDueAt(inicio, 2, undefined)).toBe('2026-09-11T12:00:00.000Z');
  });
});

describe('stepIndexOf', () => {
  it('sem log, o próximo passo é o primeiro', () => {
    expect(stepIndexOf(NODES, [])).toBe(0);
  });

  it('log da condição não faz o passo andar', () => {
    expect(stepIndexOf(NODES, [{ node_id: 'n2' }])).toBe(0);
  });

  it('passo cumprido empurra para o seguinte', () => {
    expect(stepIndexOf(NODES, [{ node_id: 'n1' }])).toBe(1);
    expect(stepIndexOf(NODES, [{ node_id: 'n1' }, { node_id: 'n2' }, { node_id: 'n3' }])).toBe(2);
  });

  it('todos os passos cumpridos = fim da trilha', () => {
    expect(stepIndexOf(NODES, [{ node_id: 'n1' }, { node_id: 'n3' }, { node_id: 'n5' }])).toBe(3);
  });
});

describe('firstPendingNode', () => {
  it('o motor pega o primeiro nó ainda não cumprido, condição incluída', () => {
    expect(firstPendingNode(NODES, [])?.id).toBe('n1');
    expect(firstPendingNode(NODES, [{ node_id: 'n1' }])?.id).toBe('n2');
    expect(firstPendingNode(NODES, [{ node_id: 'n1' }, { node_id: 'n2' }])?.id).toBe('n3');
  });

  it('trilha inteira cumprida não tem próximo nó', () => {
    expect(
      firstPendingNode(
        NODES,
        NODES.map((n) => ({ node_id: n.id })),
      ),
    ).toBeUndefined();
  });
});
