import {
  dentroDaArea,
  diasDaSemana,
  idade,
  lerCoordenada,
  normalizarCnae,
  ordemVizinho,
  planejarSemana,
  rankDoNovo,
  sabadoDaSemana,
  segundaDaSemana,
  type Candidato,
} from '../route-rules';

describe('semana de rota (seg → sáb)', () => {
  it('segunda da semana: qualquer dia de seg a sáb, e domingo volta para a segunda anterior', () => {
    expect(segundaDaSemana('2026-10-19')).toBe('2026-10-19'); // segunda
    expect(segundaDaSemana('2026-10-24')).toBe('2026-10-19'); // sábado
    expect(segundaDaSemana('2026-10-25')).toBe('2026-10-19'); // domingo
  });

  it('seis dias, de segunda a sábado', () => {
    expect(diasDaSemana('2026-10-22')).toEqual([
      '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24',
    ]);
  });

  it('sábado da semana — no domingo, o sábado seguinte', () => {
    expect(sabadoDaSemana('2026-10-20')).toBe('2026-10-24');
    expect(sabadoDaSemana('2026-10-24')).toBe('2026-10-24');
    expect(sabadoDaSemana('2026-10-25')).toBe('2026-10-31');
  });
});

describe('idade', () => {
  it('conta o aniversário só quando chega', () => {
    expect(idade('1990-10-17', '2026-10-16')).toBe(35);
    expect(idade('1990-10-16', '2026-10-16')).toBe(36);
  });
});

describe('dentroDaArea', () => {
  const centro = { lat: -19.93, lng: -43.94 };
  const lead = (lat: number | null, lng: number | null, bairro: string | null = null) => ({ lat, lng, bairro });

  it('sem área = praça inteira, mas sem localização nunca', () => {
    const area = { lat: null, lng: null, radius_km: null, bairros: [] };
    expect(dentroDaArea(lead(-19.9, -43.9), area)).toBe(true);
    expect(dentroDaArea(lead(null, null), area)).toBe(false);
  });

  it('raio ou bairro (sem acento, sem caixa)', () => {
    const area = { ...centro, radius_km: 1, bairros: ['São Pedro'] };
    expect(dentroDaArea(lead(-19.931, -43.941), area)).toBe(true); // ~150 m
    expect(dentroDaArea(lead(-19.99, -43.99), area)).toBe(false);
    expect(dentroDaArea(lead(-19.99, -43.99, 'sao pedro'), area)).toBe(true);
  });
});

describe('ordemVizinho', () => {
  it('começa pelo mais perto do início e segue pelo vizinho', () => {
    const p = [
      { id: 'c', lat: 0, lng: 3 },
      { id: 'a', lat: 0, lng: 1 },
      { id: 'b', lat: 0, lng: 2 },
    ];
    expect(ordemVizinho(p, { lat: 0, lng: 0 }).map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('planejarSemana', () => {
  const dias = ['2026-10-19', '2026-10-20', '2026-10-21'];
  const cand = (id: string, lat: number, lng: number, rank = 3, extra: Partial<Candidato> = {}): Candidato => ({
    id, lat, lng, rank, reason: 'novo', ...extra,
  });

  it('retorno vai para o dia combinado; o resto em blocos de meta por região', () => {
    const lista: Candidato[] = [
      cand('r1', 0, 0.5, 0, { reason: 'retorno', dia: '2026-10-21' }),
      // leste
      cand('e1', 0, 1), cand('e2', 0.01, 1), cand('e3', -0.01, 1),
      // norte
      cand('n1', 1, 0), cand('n2', 1, 0.01), cand('n3', 1, -0.01),
      // oeste
      cand('w1', 0, -1), cand('w2', 0.01, -1),
    ];
    const plano = planejarSemana({ candidatos: lista, dias, meta: 3, centro: { lat: 0, lng: 0 } });
    const doDia = (d: string) => plano.get(d)!.map((p) => p.lead_id).sort();
    expect(plano.get('2026-10-21')!.some((p) => p.lead_id === 'r1' && p.reason === 'retorno')).toBe(true);
    // Sobram 8 vagas (3 + 3 + 2) para 8 candidatos: todos entram, cada dia numa região.
    const todos = [...doDia('2026-10-19'), ...doDia('2026-10-20'), ...doDia('2026-10-21')];
    expect(todos.sort()).toEqual(['e1', 'e2', 'e3', 'n1', 'n2', 'n3', 'r1', 'w1', 'w2'].sort());
    for (const d of dias) {
      const prefixos = new Set(plano.get(d)!.filter((p) => p.reason !== 'retorno').map((p) => p.lead_id[0]));
      expect(prefixos.size).toBeLessThanOrEqual(2);
    }
  });

  it('respeita a meta e a prioridade; é determinístico', () => {
    const lista = Array.from({ length: 20 }, (_, i) => cand(`l${String(i).padStart(2, '0')}`, i * 0.001, 0.5, i < 5 ? 2 : 4));
    const a = planejarSemana({ candidatos: lista, dias, meta: 2, centro: null });
    const b = planejarSemana({ candidatos: [...lista].reverse(), dias, meta: 2, centro: null });
    expect([...a.values()].flat()).toHaveLength(6);
    expect([...a.values()].flat().every((p) => ['l00', 'l01', 'l02', 'l03', 'l04', 'l05'].includes(p.lead_id))).toBe(true);
    expect([...a.entries()]).toEqual([...b.entries()]);
  });

  it('retorno de outra semana fica de fora; vencido antes da semana entra com prioridade', () => {
    const plano = planejarSemana({
      candidatos: [
        cand('futuro', 0, 1, 0, { reason: 'retorno', dia: '2026-11-02' }),
        cand('vencido', 0, 1, 0, { reason: 'retorno', dia: '2026-10-10' }),
        cand('novo', 0, 2, 3),
      ],
      dias: ['2026-10-19'],
      meta: 1,
      centro: null,
    });
    expect(plano.get('2026-10-19')).toEqual([{ lead_id: 'vencido', reason: 'retorno' }]);
  });
});

describe('rankDoNovo, CNAE e coordenadas de planilha', () => {
  it('casa grande antes de alvo; já visitado por último', () => {
    expect(rankDoNovo('grande', false)).toBeLessThan(rankDoNovo('alvo', false));
    expect(rankDoNovo('grande', true)).toBe(4);
  });

  it('CNAE com ou sem máscara', () => {
    expect(normalizarCnae('5611-2/01')).toBe('5611201');
    expect(normalizarCnae(5611201)).toBe('5611201');
    expect(normalizarCnae('56112')).toBeNull();
  });

  it('coordenada com vírgula; fora de faixa ou zero vira nulo', () => {
    expect(lerCoordenada('-19,9312', 90)).toBe(-19.9312);
    expect(lerCoordenada('123', 90)).toBeNull();
    expect(lerCoordenada('0', 180)).toBeNull();
    expect(lerCoordenada('abc', 180)).toBeNull();
  });
});
