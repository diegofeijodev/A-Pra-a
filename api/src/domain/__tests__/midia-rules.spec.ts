import {
  campMetrics,
  campanhaName,
  fillHours,
  gatesOk,
  type CampLeadRow,
  type FillVaga,
  type StepStateRow,
  type TrafficDayRow,
  type TrafficEntryRow,
} from '../midia-rules';

const CAMP = '00000000-0000-4000-8000-0000000000c1';
const OUTRA = '00000000-0000-4000-8000-0000000000c2';
const ENTRY = '00000000-0000-4000-8000-0000000000e1';
const ENTRY_OUTRA = '00000000-0000-4000-8000-0000000000e2';

const step = (step_n: number, over: Partial<StepStateRow> = {}): StepStateRow => ({
  step_n,
  actual: null,
  unlocked_at: null,
  ...over,
});

const day = (over: Partial<TrafficDayRow> = {}): TrafficDayRow => ({
  entry_id: ENTRY,
  investido: 0,
  alcance: 0,
  cliques: 0,
  conversoes: 0,
  ...over,
});

const lead = (over: Partial<CampLeadRow> = {}): CampLeadRow => ({
  campanha_id: CAMP,
  stage: 1,
  ...over,
});

const entries: TrafficEntryRow[] = [
  { id: ENTRY, campanha_id: CAMP },
  { id: ENTRY_OUTRA, campanha_id: OUTRA },
];

describe('campanhaName', () => {
  it('a praça de duas palavras vira a sigla das iniciais', () => {
    expect(
      campanhaName(
        { name: 'Belo Horizonte + Contagem', city: 'Belo Horizonte · MG' },
        'contratante',
        'cadastro_contratante',
        '2026-09-01',
      ),
    ).toBe('BH-Contratante-Cadastro-Set26');
  });

  it('o "+ cidade vizinha" do nome não entra na sigla', () => {
    expect(
      campanhaName(
        { name: 'Belo Horizonte + Contagem' },
        'contratante',
        'cadastro_contratante',
        '2026-09-01',
      ),
    ).toBe('BH-Contratante-Cadastro-Set26');
  });

  it('cidade de uma palavra vira as 3 primeiras letras em maiúsculas', () => {
    expect(campanhaName({ city: 'Contagem' }, 'freelancer', 'cadastro_freelancer', '2026-12-31')).toBe(
      'CON-Freelancer-CadFreela-Dez26',
    );
  });

  it('público diferente de freelancer é sempre Contratante e objetivo desconhecido cai em Marca', () => {
    expect(campanhaName({ city: 'Uberlândia' }, 'contratante', 'nao-existe', '2027-01-15')).toBe(
      'UBE-Contratante-Marca-Jan27',
    );
  });

  it('sem praça o nome não quebra', () => {
    expect(campanhaName(undefined, 'freelancer', 'primeira_vaga', '2026-09-01')).toBe(
      'PRA-Freelancer-PrimeiraVaga-Set26',
    );
  });

  it('a data é lida ao meio-dia UTC — 1º do mês não escorrega para o mês anterior', () => {
    expect(campanhaName({ city: 'Contagem' }, 'contratante', 'reativacao', '2026-10-01')).toBe(
      'CON-Contratante-Reativacao-Out26',
    );
  });
});

describe('gatesOk', () => {
  it('etapa 2 com 22 garçons falta o portão dos 40', () => {
    const g = gatesOk([step(2, { actual: 22 })]);
    expect(g.ok).toBe(false);
    expect(g.falta).toEqual([
      'Etapa 2 — 40 garçons confirmados (hoje: 22)',
      'Etapa 6 — 5 clientes com segunda vaga (hoje: 0)',
    ]);
  });

  it('etapa sem linha nenhuma conta como zero', () => {
    expect(gatesOk([]).falta).toHaveLength(2);
  });

  it('bateu os dois números, o portão abre', () => {
    expect(gatesOk([step(2, { actual: 40 }), step(6, { actual: 5 })])).toEqual({ ok: true, falta: [] });
  });

  it('etapa liberada na mão dispensa o número (unlocked_at da etapa seguinte)', () => {
    const g = gatesOk([
      step(2, { actual: 22 }),
      step(3, { unlocked_at: new Date('2026-09-09T12:00:00.000Z') }),
      step(6, { actual: 0 }),
      step(7, { unlocked_at: new Date('2026-09-09T12:00:00.000Z') }),
    ]);
    expect(g).toEqual({ ok: true, falta: [] });
  });

  it('liberar só a etapa 3 não abre o portão da etapa 6', () => {
    const g = gatesOk([
      step(2, { actual: 0 }),
      step(3, { unlocked_at: new Date('2026-09-09T12:00:00.000Z') }),
    ]);
    expect(g.ok).toBe(false);
    expect(g.falta).toEqual(['Etapa 6 — 5 clientes com segunda vaga (hoje: 0)']);
  });
});

describe('fillHours', () => {
  const vaga = (over: Partial<FillVaga> = {}): FillVaga => ({ filled: false, hours: null, ...over });

  it('sem vaga preenchida com hora, não há média', () => {
    expect(fillHours([])).toBeNull();
    expect(fillHours([vaga({ filled: true }), vaga({ hours: 3 })])).toBeNull();
  });

  it('média só das vagas preenchidas que anotaram a hora', () => {
    expect(
      fillHours([
        vaga({ filled: true, hours: 3 }),
        vaga({ filled: true, hours: 5 }),
        vaga({ filled: false, hours: 100 }),
        vaga({ filled: true, hours: null }),
      ]),
    ).toBe(4);
  });
});

describe('campMetrics', () => {
  it('2 ativos com 600 investido dão custo por ativo de 300, acima do teto de 130', () => {
    const m = campMetrics(
      { id: CAMP, gasto: 0, cac_teto: 130 },
      entries,
      [day({ investido: 400, conversoes: 3 }), day({ investido: 200, conversoes: 1 })],
      [lead({ stage: 7 }), lead({ stage: 7 }), lead({ stage: 5 }), lead({ stage: 2 })],
    );
    expect(m.investido).toBe(600);
    expect(m.ativos).toBe(2);
    expect(m.cp_ativo).toBe(300);
    expect(m.acima_teto).toBe(true);
  });

  it('teto folgado não acende o alerta', () => {
    const m = campMetrics(
      { id: CAMP, gasto: 0, cac_teto: 400 },
      entries,
      [day({ investido: 600 })],
      [lead({ stage: 7 }), lead({ stage: 7 })],
    );
    expect(m.cp_ativo).toBe(300);
    expect(m.acima_teto).toBe(false);
  });

  it('sem ativo nenhum o alerta fica desligado (não divide por zero)', () => {
    const m = campMetrics(
      { id: CAMP, gasto: 0, cac_teto: 1 },
      entries,
      [day({ investido: 600 })],
      [lead({ stage: 4 })],
    );
    expect(m.ativos).toBe(0);
    expect(m.cp_ativo).toBe(0);
    expect(m.acima_teto).toBe(false);
  });

  it('cadastro é etapa 5 ou mais; ativo é exatamente a 7', () => {
    const m = campMetrics(
      { id: CAMP, gasto: 0, cac_teto: 130 },
      entries,
      [day({ investido: 300 })],
      [lead({ stage: 4 }), lead({ stage: 5 }), lead({ stage: 6 }), lead({ stage: 7 }), lead({ stage: 8 })],
    );
    expect(m.leads).toBe(5);
    expect(m.cadastros).toBe(4);
    expect(m.ativos).toBe(1);
    expect(m.cp_cadastro).toBe(75);
  });

  it('só conta o lead e o dia desta campanha', () => {
    const m = campMetrics(
      { id: CAMP, gasto: 0, cac_teto: 130 },
      entries,
      [
        day({ investido: 100, alcance: 1000, cliques: 10, conversoes: 2 }),
        day({ entry_id: ENTRY_OUTRA, investido: 999 }),
      ],
      [lead({ stage: 7 }), lead({ campanha_id: OUTRA, stage: 7 }), lead({ campanha_id: null, stage: 7 })],
    );
    expect(m.investido).toBe(100);
    expect(m.alcance).toBe(1000);
    expect(m.cliques).toBe(10);
    expect(m.conversoes).toBe(2);
    expect(m.cpc).toBe(50);
    expect(m.leads).toBe(1);
  });

  it('sem dia lançado, o investido é o gasto declarado na campanha', () => {
    const m = campMetrics({ id: CAMP, gasto: 1500, cac_teto: 130 }, entries, [], []);
    expect(m.investido).toBe(1500);
    expect(m.cpc).toBe(0);
    expect(m.cp_cadastro).toBe(0);
  });
});
