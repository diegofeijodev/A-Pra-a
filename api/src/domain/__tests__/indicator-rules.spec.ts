import { addDays, monthRange, todaySp, weekdayOf } from '../../common/time/dates';
import { IND_CATALOG, type IndDef, type IndKey } from '../catalog/indicators';
import {
  activeByMonth,
  canalOf,
  canalRows,
  computeValue,
  emptyIndData,
  periodRange,
  personRows,
  pracaRows,
  prevRange,
  readIndicator,
  semaphore,
  stageEnteredAt,
  whatChanged,
  type IndActionRow,
  type IndData,
  type IndLeadRow,
  type IndRange,
} from '../indicator-rules';

const P1 = '00000000-0000-4000-8000-0000000000a1';
const P2 = '00000000-0000-4000-8000-0000000000a2';
const U1 = '00000000-0000-4000-8000-000000000011';
const U2 = '00000000-0000-4000-8000-000000000012';
const CAMP = '00000000-0000-4000-8000-0000000000c1';
const ENTRY = '00000000-0000-4000-8000-0000000000e1';

const HOJE = '2026-09-09';
const range = (from: string, to: string, label = 'teste'): IndRange => ({ from, to, label });
const MES = range('2026-09-01', HOJE, 'este mês');

let n = 0;
const lead = (over: Partial<IndLeadRow> = {}): IndLeadRow => ({
  id: `lead-${++n}`,
  praca_id: P1,
  owner_id: U1,
  origem: 'prospecção',
  stage: 1,
  entered_at: '2026-09-01',
  stage_since: '2026-09-05',
  events: [],
  vagas: [],
  ...over,
});

const acao = (over: Partial<IndActionRow> = {}): IndActionRow => ({
  praca_id: P1,
  step: 1,
  owners: [U1],
  rec: { kind: 'once', day: 0 },
  due_override: null,
  completed_at: null,
  completions: [],
  ...over,
});

const data = (over: Partial<IndData> = {}): IndData => ({
  ...emptyIndData(),
  pracas: [{ id: P1, name: 'Belo Horizonte + Contagem', start_date: '2026-09-01', steps: {} }],
  users: [{ id: U1, name: 'Daniel', email: 'daniel@praca.local' }],
  ...over,
});

const def = (key: IndKey): IndDef => IND_CATALOG.find((d) => d.key === key)!;

// ── período ────────────────────────────────────────────────────
describe('periodRange', () => {
  it('hoje é o mesmo dia nas duas pontas', () => {
    expect(periodRange('hoje', undefined, HOJE)).toEqual({ from: HOJE, to: HOJE, label: 'hoje' });
  });

  it('a semana começa na SEGUNDA (não no domingo)', () => {
    // 2026-09-09 é uma quarta-feira.
    expect(weekdayOf(HOJE)).toBe(3);
    const r = periodRange('semana', undefined, HOJE);
    expect(r).toEqual({ from: '2026-09-07', to: HOJE, label: 'esta semana' });
    expect(weekdayOf(r.from)).toBe(1);
  });

  it('a segunda-feira é o primeiro dia da própria semana', () => {
    expect(periodRange('semana', undefined, '2026-09-07').from).toBe('2026-09-07');
  });

  it('o domingo fecha a semana que começou na segunda anterior', () => {
    expect(periodRange('semana', undefined, '2026-09-13').from).toBe('2026-09-07');
  });

  it('o mês vai do dia 1º até hoje', () => {
    expect(periodRange('mes', undefined, HOJE)).toEqual({
      from: '2026-09-01',
      to: HOJE,
      label: 'este mês',
    });
  });

  it('d90 são 90 dias contando hoje', () => {
    const r = periodRange('d90', undefined, HOJE);
    expect(r.from).toBe('2026-06-12');
    expect(r.label).toBe('últimos 90 dias');
  });

  it('o período livre usa as datas dadas', () => {
    expect(periodRange('livre', { from: '2026-08-01', to: '2026-08-31' }, HOJE)).toEqual({
      from: '2026-08-01',
      to: '2026-08-31',
      label: 'período livre',
    });
  });

  it('o período livre sem datas cai em 30 dias', () => {
    expect(periodRange('livre', undefined, HOJE).from).toBe('2026-08-10');
  });

  it('o período anterior tem o mesmo tamanho e termina na véspera', () => {
    expect(prevRange(range('2026-09-01', '2026-09-10'))).toEqual({
      from: '2026-08-22',
      to: '2026-08-31',
      label: 'período anterior',
    });
  });

  it('o anterior de um dia só é o dia de véspera', () => {
    expect(prevRange(range(HOJE, HOJE))).toMatchObject({ from: '2026-09-08', to: '2026-09-08' });
  });
});

// ── semáforo ───────────────────────────────────────────────────
describe('semaphore', () => {
  it('até 15% fora da meta é amarelo', () => {
    expect(semaphore(38, 40, 'gte')).toBe('warn');
  });

  it('abaixo de 85% da meta é vermelho', () => {
    expect(semaphore(30, 40, 'gte')).toBe('bad');
  });

  it('meta de teto batida é verde', () => {
    expect(semaphore(3.5, 4, 'lte')).toBe('ok');
  });

  it('teto estourado até 15% é amarelo, acima é vermelho', () => {
    expect(semaphore(4.5, 4, 'lte')).toBe('warn');
    expect(semaphore(6, 4, 'lte')).toBe('bad');
  });

  it('sem número não há cor', () => {
    expect(semaphore(null, 40, 'gte')).toBe('none');
    expect(semaphore(undefined, 40, 'gte')).toBe('none');
    expect(semaphore(Number.NaN, 40, 'gte')).toBe('none');
    expect(semaphore(Number.POSITIVE_INFINITY, 40, 'gte')).toBe('none');
  });
});

// ── entrada na etapa ───────────────────────────────────────────
describe('stageEnteredAt', () => {
  it('usa o stage_to do evento, não o texto', () => {
    const l = lead({
      stage: 7,
      stage_since: '2026-09-08',
      events: [
        { kind: 'stage', at: '2026-09-05T12:00:00.000Z', stage_to: 7 },
        { kind: 'note', at: '2026-09-01T12:00:00.000Z', stage_to: null },
      ],
    });
    expect(stageEnteredAt(l, 7)).toBe('2026-09-05');
  });

  it('pega o evento MAIS ANTIGO quando o lead voltou para a etapa', () => {
    const l = lead({
      stage: 7,
      events: [
        { kind: 'stage', at: '2026-09-08T12:00:00.000Z', stage_to: 7 },
        { kind: 'stage', at: '2026-09-02T12:00:00.000Z', stage_to: 7 },
      ],
    });
    expect(stageEnteredAt(l, 7)).toBe('2026-09-02');
  });

  it('sem evento da etapa cai no stage_since quando o lead já passou dela', () => {
    expect(stageEnteredAt(lead({ stage: 7, stage_since: '2026-09-04' }), 6)).toBe('2026-09-04');
  });

  it('sem evento e sem ter chegado na etapa é indefinido', () => {
    expect(stageEnteredAt(lead({ stage: 3, stage_since: '2026-09-04' }), 7)).toBeUndefined();
  });

  it('um texto que menciona outro número não confunde a etapa', () => {
    const l = lead({
      stage: 7,
      stage_since: '2026-09-06',
      events: [{ kind: 'stage', at: '2026-09-02T12:00:00.000Z', stage_to: 5 }],
    });
    expect(stageEnteredAt(l, 7)).toBe('2026-09-06');
  });
});

// ── valores calculados ─────────────────────────────────────────
describe('computeValue', () => {
  it('clientes_ativos conta quem está na etapa 7 e entrou até o fim do período', () => {
    const d = data({
      leads: [
        lead({ stage: 7, stage_since: '2026-09-03' }),
        lead({ stage: 7, stage_since: '2026-09-07' }),
        lead({ stage: 7, stage_since: '2026-09-08' }),
        lead({ stage: 6, stage_since: '2026-09-02' }),
      ],
    });
    expect(computeValue('clientes_ativos', d, null, MES)).toBe(3);
  });

  it('clientes_ativos ignora quem entrou na etapa 7 depois do fim do período', () => {
    const d = data({
      leads: [
        lead({ stage: 7, stage_since: '2026-08-20' }),
        lead({
          stage: 7,
          events: [{ kind: 'stage', at: '2026-09-05T12:00:00.000Z', stage_to: 7 }],
        }),
      ],
    });
    expect(computeValue('clientes_ativos', d, null, range('2026-08-01', '2026-08-31'))).toBe(1);
  });

  it('recontratacao: 3 leads na etapa ≥ 6, sendo 2 na 7, dá 66,67%', () => {
    const d = data({
      leads: [lead({ stage: 6 }), lead({ stage: 7 }), lead({ stage: 7 })],
    });
    expect(computeValue('recontratacao', d, null, MES)).toBeCloseTo(66.67, 2);
  });

  it('recontratacao sem ninguém na etapa 6 não tem base para calcular', () => {
    const d = data({ leads: [lead({ stage: 3 })] });
    expect(computeValue('recontratacao', d, null, MES)).toBeNull();
  });

  it('passagem_etapa: dos tocados (etapa ≥ 2), quantos chegaram a cadastrado', () => {
    const d = data({
      leads: [
        lead({ stage: 1 }), // não foi tocado: fica fora da base
        lead({ stage: 2 }),
        lead({ stage: 3 }),
        lead({ stage: 5 }),
        lead({ stage: 7 }),
      ],
    });
    // base 4 (etapas 2, 3, 5 e 7), chegaram 2 (etapas 5 e 7)
    expect(computeValue('passagem_etapa', d, null, MES)).toBe(50);
  });

  it('passagem_etapa não conta o perdido (etapa 8) como chegada', () => {
    const d = data({ leads: [lead({ stage: 2 }), lead({ stage: 8 })] });
    expect(computeValue('passagem_etapa', d, null, MES)).toBe(0);
  });

  it('leads_novos conta pela data de entrada no período', () => {
    const d = data({
      leads: [
        lead({ entered_at: '2026-09-02' }),
        lead({ entered_at: '2026-09-09' }),
        lead({ entered_at: '2026-08-31' }),
      ],
    });
    expect(computeValue('leads_novos', d, null, MES)).toBe(2);
  });

  it('perda_mensal: perdido no período sobre a base viva mais os perdidos', () => {
    const d = data({
      leads: [
        lead({ stage: 8, stage_since: '2026-09-05' }),
        lead({ stage: 5 }),
        lead({ stage: 6 }),
        lead({ stage: 7 }),
      ],
    });
    // perdidos 1; base = (etapa ≥ 5, que inclui o perdido) 4 + 1 = 5
    expect(computeValue('perda_mensal', d, null, MES)).toBe(20);
  });

  it('tempo_preencher é a média das horas das vagas preenchidas da praça', () => {
    const d = data({
      leads: [
        lead({ vagas: [{ date: '2026-09-02', filled: true, hours: 3 }] }),
        lead({ vagas: [{ date: '2026-09-03', filled: true, hours: 5 }] }),
        lead({ vagas: [{ date: '2026-09-03', filled: false, hours: null }] }),
      ],
    });
    expect(computeValue('tempo_preencher', d, P1, MES)).toBe(4);
  });

  it('tempo_preencher na empresa é a média das praças, não das vagas', () => {
    const d = data({
      pracas: [
        { id: P1, name: 'BH', start_date: '2026-09-01', steps: {} },
        { id: P2, name: 'Uberlândia', start_date: '2026-09-01', steps: {} },
      ],
      leads: [
        lead({ praca_id: P1, vagas: [{ date: '2026-09-02', filled: true, hours: 2 }] }),
        lead({ praca_id: P1, vagas: [{ date: '2026-09-02', filled: true, hours: 4 }] }),
        lead({ praca_id: P2, vagas: [{ date: '2026-09-02', filled: true, hours: 9 }] }),
      ],
    });
    // praça 1 = 3 h, praça 2 = 9 h ⇒ 6 h (a média das vagas daria 5)
    expect(computeValue('tempo_preencher', d, null, MES)).toBe(6);
  });

  it('taxa_resposta ignora o que ainda está na fila', () => {
    const d = data({
      sends: [
        { status: 'enviada', scheduled_at: '2026-09-02T12:00:00.000Z', sent_at: '2026-09-02T12:00:00.000Z', replied_at: null },
        { status: 'respondida', scheduled_at: '2026-09-03T12:00:00.000Z', sent_at: '2026-09-03T12:00:00.000Z', replied_at: null },
        { status: 'fila', scheduled_at: '2026-09-04T12:00:00.000Z', sent_at: null, replied_at: null },
      ],
    });
    expect(computeValue('taxa_resposta', d, null, MES)).toBe(50);
  });

  it('taxa_resposta conta quem tem replied_at mesmo sem o status', () => {
    const d = data({
      sends: [
        { status: 'enviada', scheduled_at: '2026-09-02T12:00:00.000Z', sent_at: '2026-09-02T12:00:00.000Z', replied_at: '2026-09-03T12:00:00.000Z' },
      ],
    });
    expect(computeValue('taxa_resposta', d, null, MES)).toBe(100);
  });

  it('taxa_resposta sem nada enviado não tem base', () => {
    expect(computeValue('taxa_resposta', data(), null, MES)).toBeNull();
  });

  it('custo_cliente divide a verba dos dias lançados pelos ativos do período', () => {
    const d = data({
      leads: [lead({ stage: 7, stage_since: '2026-09-03' }), lead({ stage: 7, stage_since: '2026-09-04' })],
      campanhas: [{ id: CAMP, praca_id: P1, gasto: 0 }],
      traffic: [{ id: ENTRY, campanha_id: CAMP }],
      days: [
        { entry_id: ENTRY, date: '2026-09-02', investido: 120 },
        { entry_id: ENTRY, date: '2026-09-03', investido: 120 },
        { entry_id: ENTRY, date: '2026-08-30', investido: 500 },
      ],
    });
    expect(computeValue('custo_cliente', d, P1, MES)).toBe(120);
  });

  it('custo_cliente cai no gasto declarado quando nenhum dia foi lançado', () => {
    const d = data({
      leads: [lead({ stage: 7, stage_since: '2026-09-03' })],
      campanhas: [{ id: CAMP, praca_id: P1, gasto: 300 }],
    });
    expect(computeValue('custo_cliente', d, P1, MES)).toBe(300);
  });

  it('custo_cliente sem verba nenhuma não tem número', () => {
    const d = data({ leads: [lead({ stage: 7, stage_since: '2026-09-03' })] });
    expect(computeValue('custo_cliente', d, P1, MES)).toBeNull();
  });

  it('playbook é o percentual das ações vencidas já concluídas', () => {
    const d = data({
      actions: [
        acao({ rec: { kind: 'once', day: 0 }, completed_at: '2026-09-01T12:00:00.000Z' }),
        acao({ rec: { kind: 'once', day: 1 } }),
        // vence depois do fim do período: não entra na base
        acao({ rec: { kind: 'once', day: 30 } }),
        // recorrente não tem vencimento: fica fora
        acao({ rec: { kind: 'daily', start_day: 0 } }),
      ],
    });
    expect(computeValue('playbook', d, P1, MES)).toBe(50);
  });

  it('playbook sem ação vencida não tem base', () => {
    const d = data({ actions: [acao({ rec: { kind: 'once', day: 60 } })] });
    expect(computeValue('playbook', d, P1, MES)).toBeNull();
  });

  it('o escopo de praça não vê o lead da outra praça', () => {
    const d = data({
      pracas: [
        { id: P1, name: 'BH', start_date: '2026-09-01', steps: {} },
        { id: P2, name: 'Uberlândia', start_date: '2026-09-01', steps: {} },
      ],
      leads: [lead({ praca_id: P1, stage: 7 }), lead({ praca_id: P2, stage: 7 })],
    });
    expect(computeValue('clientes_ativos', d, P1, MES)).toBe(1);
    expect(computeValue('clientes_ativos', d, null, MES)).toBe(2);
  });

  it('indicador à mão não tem valor calculado', () => {
    expect(computeValue('falta', data(), null, MES)).toBeNull();
    expect(computeValue('freelancers', data(), null, MES)).toBeNull();
    expect(computeValue('contratos_rede', data(), null, MES)).toBeNull();
  });
});

// ── leitura do indicador ───────────────────────────────────────
describe('readIndicator', () => {
  it('o indicador à mão lê o último lançamento até o fim do período', () => {
    const d = data({
      entries: [
        { praca_id: P1, key: 'falta', date: '2026-08-20', value: 8 },
        { praca_id: P1, key: 'falta', date: '2026-09-05', value: 2.5 },
        { praca_id: P1, key: 'falta', date: '2026-09-20', value: 90 },
      ],
    });
    const r = readIndicator(def('falta'), d, P1, MES, HOJE);
    expect(r.value).toBe(2.5);
    expect(r.prev).toBe(8);
    expect(r.delta).toBeCloseTo(-5.5, 5);
    expect(r.sem).toBe('ok');
    expect(r.last_at).toBe('2026-09-20');
    expect(r.history.map((h) => h.date)).toEqual(['2026-08-20', '2026-09-05', '2026-09-20']);
  });

  it('o número velho fica marcado como velho (frequência semanal, 8 dias)', () => {
    const d = data({ entries: [{ praca_id: P1, key: 'falta', date: '2026-09-01', value: 2 }] });
    expect(readIndicator(def('falta'), d, P1, MES, HOJE).stale).toBe(true);
    expect(readIndicator(def('falta'), d, P1, MES, '2026-09-08').stale).toBe(false);
  });

  it('indicador à mão sem lançamento nenhum é velho e sem valor', () => {
    const r = readIndicator(def('falta'), data(), P1, MES, HOJE);
    expect(r.value).toBeNull();
    expect(r.stale).toBe(true);
    expect(r.last_at).toBeNull();
    expect(r.sem).toBe('none');
  });

  it('freelancers sem lançamento cai no resultado da etapa 2 da praça', () => {
    const d = data({
      pracas: [{ id: P1, name: 'BH', start_date: '2026-09-01', steps: { 2: { actual: 22 } } }],
    });
    expect(readIndicator(def('freelancers'), d, P1, MES, HOJE).value).toBe(22);
  });

  it('o lançamento manda mais que a etapa 2', () => {
    const d = data({
      pracas: [{ id: P1, name: 'BH', start_date: '2026-09-01', steps: { 2: { actual: 22 } } }],
      entries: [{ praca_id: P1, key: 'freelancers', date: '2026-09-08', value: 41 }],
    });
    expect(readIndicator(def('freelancers'), d, P1, MES, HOJE).value).toBe(41);
  });

  it('na empresa o indicador sem unidade SOMA as praças', () => {
    const d = data({
      pracas: [
        { id: P1, name: 'BH', start_date: '2026-09-01', steps: { 2: { actual: 22 } } },
        { id: P2, name: 'Uberlândia', start_date: '2026-09-01', steps: { 2: { actual: 18 } } },
      ],
    });
    expect(readIndicator(def('freelancers'), d, null, MES, HOJE).value).toBe(40);
  });

  it('na empresa o indicador em % é a MÉDIA das praças', () => {
    const d = data({
      pracas: [
        { id: P1, name: 'BH', start_date: '2026-09-01', steps: {} },
        { id: P2, name: 'Uberlândia', start_date: '2026-09-01', steps: {} },
      ],
      entries: [
        { praca_id: P1, key: 'falta', date: '2026-09-08', value: 2 },
        { praca_id: P2, key: 'falta', date: '2026-09-08', value: 6 },
      ],
    });
    const r = readIndicator(def('falta'), d, null, MES, HOJE);
    expect(r.value).toBe(4);
    expect(r.stale).toBe(false);
    expect(r.last_at).toBe('2026-09-08');
  });

  it('na empresa só é velho quando TODAS as praças estão velhas', () => {
    const d = data({
      pracas: [
        { id: P1, name: 'BH', start_date: '2026-09-01', steps: {} },
        { id: P2, name: 'Uberlândia', start_date: '2026-09-01', steps: {} },
      ],
      entries: [
        { praca_id: P1, key: 'falta', date: '2026-08-01', value: 2 },
        { praca_id: P2, key: 'falta', date: '2026-09-08', value: 6 },
      ],
    });
    expect(readIndicator(def('falta'), d, null, MES, HOJE).stale).toBe(false);
    expect(readIndicator(def('contratos_rede'), d, null, MES, HOJE).stale).toBe(true);
  });

  it('o indicador calculado compara com a janela anterior de mesmo tamanho', () => {
    const d = data({
      leads: [
        lead({ entered_at: '2026-09-02' }),
        lead({ entered_at: '2026-09-03' }),
        lead({ entered_at: '2026-08-25' }),
      ],
    });
    const r = readIndicator(def('leads_novos'), d, P1, range('2026-09-01', '2026-09-09'), HOJE);
    expect(r.value).toBe(2);
    expect(r.prev).toBe(1);
    expect(r.delta).toBe(1);
    expect(r.stale).toBe(false);
  });
});

// ── clientes ativos mês a mês ──────────────────────────────────
describe('activeByMonth', () => {
  it('devolve 12 meses terminando no mês de hoje', () => {
    const m = activeByMonth(data(), null, 12, HOJE);
    expect(m).toHaveLength(12);
    expect(m[0]!.month).toBe('2025-10');
    expect(m[11]!.month).toBe('2026-09');
    expect(m[11]!.label).toBe('set/26');
  });

  it('a meta é interpolada do dia 1º de jun/26 até 31/12/26, sem passar de 500', () => {
    const m = activeByMonth(data(), null, 12, HOJE);
    const meta = (month: string) => m.find((x) => x.month === month)!.meta;
    expect(meta('2025-10')).toBe(0); // antes de jun/26 a meta é zero
    expect(meta('2026-06')).toBe(0);
    // a meta do mês é medida no dia 1º: 92 de 213 dias do caminho
    expect(meta('2026-09')).toBe(Math.round((92 / 213) * 500));
    expect(activeByMonth(data(), null, 1, '2027-06-15').at(-1)!.meta).toBe(500);
  });

  it('o cliente ativo entra no mês em que virou ativo e continua nos seguintes', () => {
    const d = data({ leads: [lead({ stage: 7, stage_since: '2026-08-15' })] });
    const m = activeByMonth(d, null, 12, HOJE);
    expect(m.find((x) => x.month === '2026-07')!.value).toBe(0);
    expect(m.find((x) => x.month === '2026-08')!.value).toBe(1);
    expect(m.find((x) => x.month === '2026-09')!.value).toBe(1);
  });
});

// ── o que mudou ────────────────────────────────────────────────
describe('whatChanged', () => {
  it('separa o que melhorou do que piorou nos últimos 7 dias', () => {
    const d = data({
      leads: [
        // leads_novos (meta gte): 1 na semana anterior, 3 nesta ⇒ melhorou
        lead({ entered_at: '2026-08-30' }),
        lead({ entered_at: '2026-09-04' }),
        lead({ entered_at: '2026-09-05' }),
        lead({ entered_at: '2026-09-06' }),
      ],
      sends: [
        // taxa_resposta (meta gte): 100% antes, 0% agora ⇒ piorou
        { status: 'respondida', scheduled_at: '2026-08-30T12:00:00.000Z', sent_at: '2026-08-30T12:00:00.000Z', replied_at: null },
        { status: 'enviada', scheduled_at: '2026-09-05T12:00:00.000Z', sent_at: '2026-09-05T12:00:00.000Z', replied_at: null },
      ],
    });
    const { good, bad } = whatChanged(d, null, HOJE);
    expect(good.map((c) => c.name)).toContain(def('leads_novos').name);
    expect(bad.map((c) => c.name)).toContain(def('taxa_resposta').name);
    expect(good.find((c) => c.name === def('leads_novos').name)).toMatchObject({
      from: 1,
      to: 3,
      pct: 200,
      good: true,
    });
  });

  it('variação menor que 1% não é notícia', () => {
    const { good, bad } = whatChanged(data(), null, HOJE);
    expect(good).toHaveLength(0);
    expect(bad).toHaveLength(0);
  });

  it('no máximo 3 de cada lado, do maior salto para o menor', () => {
    const d = data({
      leads: [
        lead({ entered_at: '2026-08-31' }),
        lead({ entered_at: '2026-09-04' }),
        lead({ entered_at: '2026-09-05' }),
        lead({ stage: 7, stage_since: '2026-09-05' }),
        lead({ stage: 6, stage_since: '2026-09-06' }),
      ],
    });
    const { good, bad } = whatChanged(d, null, HOJE);
    expect(good.length).toBeLessThanOrEqual(3);
    expect(bad.length).toBeLessThanOrEqual(3);
    for (let i = 1; i < good.length; i++) {
      expect(Math.abs(good[i - 1]!.pct)).toBeGreaterThanOrEqual(Math.abs(good[i]!.pct));
    }
  });
});

// ── visão praça ────────────────────────────────────────────────
describe('pracaRows', () => {
  it('a etapa atual é a primeira que ainda tem ação em aberto', () => {
    // uma ação em cada uma das 11 etapas; as três primeiras concluídas
    const d = data({
      actions: Array.from({ length: 11 }, (_, i) =>
        acao({ step: i + 1, completed_at: i < 3 ? '2026-09-02T12:00:00.000Z' : null }),
      ),
    });
    expect(pracaRows(d, MES, HOJE)[0]!.step_atual).toBe(4);
  });

  it('etapa sem ação nenhuma conta como fechada (quirk do protótipo) e a atual não passa de 11', () => {
    const d = data({ actions: [] });
    expect(pracaRows(d, MES, HOJE)[0]!.step_atual).toBe(11);
    const so3 = data({
      actions: [
        acao({ step: 1, completed_at: '2026-09-02T12:00:00.000Z' }),
        acao({ step: 2, completed_at: '2026-09-02T12:00:00.000Z' }),
        acao({ step: 3 }),
      ],
    });
    // 10 etapas "fechadas" (as 2 concluídas + as 8 vazias) ⇒ 11, o teto
    expect(pracaRows(so3, MES, HOJE)[0]!.step_atual).toBe(11);
  });

  it('conta as ações pontuais vencidas e não concluídas', () => {
    const d = data({
      actions: [
        acao({ rec: { kind: 'once', day: 0 } }), // 2026-09-01 < hoje
        acao({ rec: { kind: 'once', day: 1 } }), // 2026-09-02 < hoje
        acao({ rec: { kind: 'once', day: 20 } }), // no futuro
        acao({ rec: { kind: 'once', day: 2 }, completed_at: '2026-09-03T12:00:00.000Z' }),
        acao({ rec: { kind: 'daily', start_day: 0 } }), // recorrente não atrasa
      ],
    });
    expect(pracaRows(d, MES, HOJE)[0]!.atrasadas).toBe(2);
  });

  it('a linha traz os números da praça, não da empresa', () => {
    const d = data({
      pracas: [
        { id: P1, name: 'BH', start_date: '2026-09-01', steps: { 2: { actual: 22 } } },
        { id: P2, name: 'Uberlândia', start_date: '2026-09-01', steps: {} },
      ],
      leads: [
        lead({ praca_id: P1, stage: 7, stage_since: '2026-09-03' }),
        lead({ praca_id: P1, stage: 6 }),
        lead({ praca_id: P2, stage: 7, stage_since: '2026-09-03' }),
      ],
    });
    const rows = pracaRows(d, MES, HOJE);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      praca: { id: P1, name: 'BH' },
      ativos: 1,
      recontratacao: 50,
      freelancers: 22,
      falta: null,
      custo: null,
    });
    expect(rows[1]).toMatchObject({ ativos: 1, recontratacao: 100, freelancers: null });
  });
});

// ── visão pessoa ───────────────────────────────────────────────
describe('personRows', () => {
  it('conta as conclusões do período e as atrasadas AINDA em aberto', () => {
    const d = data({
      users: [{ id: U1, name: 'Daniel', email: 'daniel@praca.local' }],
      actions: [
        // concluída: ação concluída nunca conta como atrasada (regra do protótipo)
        acao({ rec: { kind: 'once', day: 0 }, completed_at: '2026-09-05T12:00:00.000Z' }),
        acao({ rec: { kind: 'once', day: 20 }, completed_at: '2026-09-05T12:00:00.000Z' }),
        // concluída fora do período: não conta
        acao({ rec: { kind: 'once', day: 3 }, completed_at: '2026-08-05T12:00:00.000Z' }),
        // vencida e aberta: atrasada
        acao({ rec: { kind: 'once', day: 1 } }),
        // de outra pessoa
        acao({ rec: { kind: 'once', day: 1 }, owners: [U2] }),
      ],
    });
    expect(personRows(d, MES, HOJE)[0]).toMatchObject({ no_prazo: 2, atrasadas: 1 });
  });

  it('a conclusão de ação recorrente conta pelo dia em que foi feita', () => {
    const d = data({
      actions: [
        acao({
          rec: { kind: 'daily', start_day: 0 },
          completions: [
            { date: '2026-09-05', at: '2026-09-05T12:00:00.000Z' },
            { date: '2026-09-06', at: '2026-09-06T12:00:00.000Z' },
            { date: '2026-08-20', at: '2026-08-20T12:00:00.000Z' },
          ],
        }),
      ],
    });
    expect(personRows(d, MES, HOJE)[0]!.no_prazo).toBe(2);
  });

  it('leads tocados são os leads distintos com contato no período', () => {
    const d = data({
      leads: [
        lead({
          events: [
            { kind: 'msg_out', at: '2026-09-02T12:00:00.000Z', stage_to: null },
            { kind: 'call', at: '2026-09-03T12:00:00.000Z', stage_to: null },
          ],
        }),
        lead({ events: [{ kind: 'visit', at: '2026-09-04T12:00:00.000Z', stage_to: null }] }),
        // nota não é contato
        lead({ events: [{ kind: 'note', at: '2026-09-04T12:00:00.000Z', stage_to: null }] }),
        // contato fora do período
        lead({ events: [{ kind: 'msg_out', at: '2026-08-04T12:00:00.000Z', stage_to: null }] }),
        // lead de outra pessoa
        lead({ owner_id: U2, events: [{ kind: 'call', at: '2026-09-04T12:00:00.000Z', stage_to: null }] }),
      ],
    });
    expect(personRows(d, MES, HOJE)[0]!.leads_tocados).toBe(2);
  });

  it('avançaram de etapa, fechados e vagas rodadas', () => {
    const d = data({
      leads: [
        lead({
          stage: 6,
          stage_since: '2026-09-03',
          events: [{ kind: 'stage', at: '2026-09-03T12:00:00.000Z', stage_to: 6 }],
          vagas: [
            { date: '2026-09-04', filled: true, hours: 3 },
            { date: '2026-08-04', filled: true, hours: 3 },
          ],
        }),
        lead({ stage: 7, stage_since: '2026-08-01' }), // fechou antes do período
      ],
    });
    expect(personRows(d, MES, HOJE)[0]).toMatchObject({
      leads_avancados: 1,
      fechados: 1,
      vagas: 1,
    });
  });

  it('uma linha por pessoa, na ordem em que as pessoas vieram', () => {
    const d = data({
      users: [
        { id: U1, name: 'Diego', email: 'diego@praca.local' },
        { id: U2, name: 'Daniel', email: 'daniel@praca.local' },
      ],
    });
    expect(personRows(d, MES, HOJE).map((r) => r.name)).toEqual(['Diego', 'Daniel']);
  });
});

// ── visão canal ────────────────────────────────────────────────
describe('canalOf', () => {
  it('mapeia a origem escrita no lead para um dos 6 canais', () => {
    expect(canalOf('tráfego')).toBe('trafego');
    expect(canalOf('anúncio')).toBe('trafego');
    expect(canalOf('indicação')).toBe('indicacao');
    expect(canalOf('importação')).toBe('prospeccao');
    expect(canalOf('prospecção')).toBe('prospeccao');
    expect(canalOf('Instagram')).toBe('organico');
    expect(canalOf('feira do setor')).toBe('evento');
    expect(canalOf('contrato de rede')).toBe('rede');
  });

  it('origem desconhecida (ou vazia) cai em prospecção ativa', () => {
    expect(canalOf('')).toBe('prospeccao');
    expect(canalOf('sei lá')).toBe('prospeccao');
  });
});

describe('canalRows', () => {
  it('devolve sempre os 6 canais, com conversão e tempo até a primeira vaga', () => {
    const d = data({
      leads: [
        lead({
          origem: 'tráfego',
          stage: 7,
          entered_at: '2026-09-01',
          vagas: [
            { date: '2026-09-05', filled: true, hours: 3 },
            { date: '2026-09-03', filled: true, hours: 3 },
          ],
        }),
        lead({ origem: 'tráfego', stage: 3 }),
        lead({ origem: 'indicação', stage: 7 }),
      ],
      campanhas: [{ id: CAMP, praca_id: P1, gasto: 0 }],
      traffic: [{ id: ENTRY, campanha_id: CAMP }],
      days: [{ entry_id: ENTRY, date: '2026-09-02', investido: 240 }],
    });
    const rows = canalRows(d, P1, MES);
    expect(rows).toHaveLength(6);
    const trafego = rows.find((r) => r.id === 'trafego')!;
    expect(trafego).toMatchObject({ label: 'Tráfego pago', leads: 2, ativos: 1, conv: 50, custo: 240 });
    // a primeira vaga é a mais antiga: 2026-09-03 − 2026-09-01 = 2 dias
    expect(trafego.tempo_primeira_vaga).toBe(2);
  });

  it('só o canal de mídia paga tem custo; os outros não consomem verba', () => {
    const d = data({
      leads: [lead({ origem: 'indicação', stage: 7 })],
      campanhas: [{ id: CAMP, praca_id: P1, gasto: 500 }],
    });
    const rows = canalRows(d, P1, MES);
    expect(rows.find((r) => r.id === 'indicacao')!.custo).toBeNull();
    expect(rows.find((r) => r.id === 'trafego')).toMatchObject({ leads: 0, conv: null, custo: null });
  });
});

// ── hoje de verdade ────────────────────────────────────────────
describe('padrões de hoje', () => {
  it('sem "hoje" explícito o período usa a data de Brasília', () => {
    const hoje = todaySp();
    expect(periodRange('hoje')).toEqual({ from: hoje, to: hoje, label: 'hoje' });
    expect(periodRange('mes').from).toBe(monthRange(hoje).from);
    expect(periodRange('d90').from).toBe(addDays(hoje, -89));
  });
});
