import {
  CATEGORIAS_PINO,
  categoriaDaVisita,
  categoriaDoLead,
  classificarTelefone,
  legenda,
  META_CATEGORIA,
  rotuloEtapa,
} from '../pin-rules';

describe('categoriaDaVisita (contrato §34.3) — fluxo simples', () => {
  it.each([
    [{ result: 'cadastrou', outcome: 'conversa', freela_status: 'declarou' }, 'cadastrado'],
    [{ result: 'ja_usa', outcome: 'conversa', freela_status: 'ja_usa' }, 'ja_usa'],
    [{ result: 'retorno', outcome: 'conversa', needs_followup: true }, 'retornar'],
    [
      {
        result: 'sem_interesse',
        outcome: 'conversa',
        freela_status: 'nao_cadastrou',
        refusal_reason: 'preco',
      },
      'nao_cadastrado',
    ],
    [
      {
        result: 'sem_interesse',
        outcome: 'conversa',
        freela_status: 'nao_cadastrou',
        refusal_reason: 'nao_contrata_freelancers',
      },
      'nao_contrata',
    ],
    [{ result: 'fechado', outcome: 'fechado' }, 'fechado'],
  ])('%j → %s', (v, esperado) => expect(categoriaDaVisita(v)).toBe(esperado));
});

describe('categoriaDaVisita — fluxo completo (campos antigos)', () => {
  it.each([
    [{ outcome: 'conversa', freela_status: 'cadastrou_qr', needs_followup: true }, 'cadastrado'],
    [{ outcome: 'conversa', freela_status: 'ja_usa', needs_followup: true }, 'ja_usa'],
    [{ outcome: 'conversa', freela_status: 'nao_cadastrou', needs_followup: true }, 'retornar'],
    [
      {
        outcome: 'conversa',
        freela_status: 'nao_cadastrou',
        needs_followup: false,
        refusal_reason: 'nao_contrata_freelancers',
      },
      'nao_contrata',
    ],
    [{ outcome: 'conversa', freela_status: 'nao_cadastrou', needs_followup: false }, 'nao_cadastrado'],
    [{ outcome: 'fechado', needs_followup: true }, 'fechado'],
  ])('%j → %s', (v, esperado) => expect(categoriaDaVisita(v)).toBe(esperado));

  it('precedência: fechado > cadastrou > já usa > não contrata > retorno > sem interesse', () => {
    expect(categoriaDaVisita({ outcome: 'fechado', freela_status: 'cadastrou_qr' })).toBe('fechado');
    expect(
      categoriaDaVisita({
        freela_status: 'cadastrou_qr',
        refusal_reason: 'nao_contrata_freelancers',
        needs_followup: true,
      }),
    ).toBe('cadastrado');
    expect(categoriaDaVisita({ freela_status: 'ja_usa', needs_followup: true })).toBe('ja_usa');
    expect(categoriaDaVisita({ refusal_reason: 'nao_contrata_freelancers', needs_followup: true })).toBe(
      'nao_contrata',
    );
  });
});

describe('categoriaDoLead', () => {
  const visita = { result: 'sem_interesse', outcome: 'conversa' };
  it('sem visita concluída = a visitar; com visita = a da última', () => {
    expect(categoriaDoLead({ stage: 1 }, null, false)).toBe('a_visitar');
    expect(categoriaDoLead({ stage: 3 }, visita, false)).toBe('nao_cadastrado');
  });
  it('declaração não anulada ou etapa 5–7 = cadastrado (mesmo sem visita); etapa 8 (Perdido) não', () => {
    expect(categoriaDoLead({ stage: 3 }, visita, true)).toBe('cadastrado');
    for (const stage of [5, 6, 7]) expect(categoriaDoLead({ stage }, null, false)).toBe('cadastrado');
    expect(categoriaDoLead({ stage: 8 }, null, false)).toBe('a_visitar');
    expect(categoriaDoLead({ stage: 8 }, visita, false)).toBe('nao_cadastrado');
  });
});

describe('legenda', () => {
  it('ordem fixa, todas as categorias (as de 0 também), soma = total', () => {
    const l = legenda(
      new Map([
        ['a_visitar', 3],
        ['fechado', 1],
      ]),
      'resultado',
    );
    expect(l.map((x) => x.code)).toEqual([...CATEGORIAS_PINO]);
    expect(l.reduce((a, x) => a + x.n, 0)).toBe(4);
    expect(l[0]).toEqual({ code: 'a_visitar', label: 'A visitar', color: '#2563eb', shape: 'circulo', n: 3 });
  });
  it('cada situação tem cor e forma diferentes (cor nunca sozinha)', () => {
    const metas = Object.values(META_CATEGORIA);
    expect(new Set(metas.map((m) => m.color)).size).toBe(metas.length);
    expect(new Set(metas.map((m) => m.shape)).size).toBe(metas.length);
  });
  it('modo estágio: as 8 etapas do funil, com rótulo e cor do catálogo', () => {
    const l = legenda(new Map([['5', 2]]), 'estagio');
    expect(l).toHaveLength(8);
    expect(l[4]).toMatchObject({ code: '5', label: '5. Cadastrado', n: 2 });
    expect(rotuloEtapa(1)).toBe('1. Lead novo');
    expect(rotuloEtapa(99)).toBe('99');
  });
});

describe('classificarTelefone (Lovable classifyPhone)', () => {
  it('celular com 9 = WhatsApp; fixo; só a máscara volta', () => {
    expect(classificarTelefone('(11) 98765-4321')).toEqual({ masked: '(11) 9****-4321', kind: 'whatsapp' });
    expect(classificarTelefone('+55 31 3333-4444')).toEqual({ masked: '(31) ****-4444', kind: 'fixo' });
    expect(classificarTelefone('011 3333 4444')).toEqual({ masked: '(11) ****-4444', kind: 'fixo' });
    expect(classificarTelefone('')).toBeNull();
    expect(classificarTelefone('123')).toBeNull();
  });
});
