import { AgendaService, type AgendaAction, type AgendaInput } from '../agenda.service';

// Serviço sem dependência de banco no cálculo: `computeAgenda` é puro, o
// Prisma só aparece no método que carrega praça + ações + pessoas.
const service = new AgendaService(null as never);

const U1 = '00000000-0000-4000-8000-000000000001';
const U2 = '00000000-0000-4000-8000-000000000002';

// Hoje fixo (10/09/2026, quinta) — nada aqui depende do relógio da máquina.
const HOJE = '2026-09-10';

const PRACA = { start_date: '2026-09-01' };

// a1: once vencida em 01/09 e não concluída  → atrasada há 9 dias (dono U1)
// a2: diária desde o começo, nunca concluída → atrasada, hoje e nos 7 dias (dono U2)
// a3: once para 13/09                        → só nos próximos 7 dias (dono U1)
const a1: AgendaAction = {
  id: 'a1',
  step: 1,
  owners: [U1],
  rec: { kind: 'once', day: 0 },
  due_override: null,
  completed_at: null,
  completions: {},
};
const a2: AgendaAction = {
  id: 'a2',
  step: 4,
  owners: [U2],
  rec: { kind: 'daily', start_day: 0 },
  due_override: null,
  completed_at: null,
  completions: {},
};
const a3: AgendaAction = {
  id: 'a3',
  step: 3,
  owners: [U1],
  rec: { kind: 'once', day: 12 },
  due_override: null,
  completed_at: null,
  completions: {},
};

const base: AgendaInput = {
  praca: PRACA,
  actions: [a1, a2, a3],
  users: [{ id: U1 }, { id: U2 }],
  today: HOJE,
  person: 'all',
};

describe('AgendaService.computeAgenda', () => {
  it('atrasado: once vencida com os dias de atraso; recorrente entra uma vez só', () => {
    const { late } = service.computeAgenda(base);

    expect(late).toContainEqual({ action_id: 'a1', date: '2026-09-01', days_late: 9 });
    // a2 é diária e nunca foi feita: uma linha só, a ocorrência perdida mais
    // antiga dentro da janela de 7 dias (varredura i=7→1 do protótipo,
    // routes/index.tsx:604-608), não uma linha por dia.
    expect(late.filter((l) => l.action_id === 'a2')).toEqual([
      { action_id: 'a2', date: '2026-09-03', days_late: 7 },
    ]);
    expect(late.some((l) => l.action_id === 'a3')).toBe(false);
  });

  it('hoje: só o que cai na data de hoje', () => {
    const { today } = service.computeAgenda(base);
    expect(today).toEqual([{ action_id: 'a2', date: HOJE }]);
  });

  it('próximos 7 dias: agrupado por data, em ordem, sem incluir hoje', () => {
    const { next7 } = service.computeAgenda(base);

    expect(next7.map((b) => b.date)).toEqual([
      '2026-09-11',
      '2026-09-12',
      '2026-09-13',
      '2026-09-14',
      '2026-09-15',
      '2026-09-16',
      '2026-09-17',
    ]);
    expect(next7[0]?.action_ids).toEqual(['a2']);
    // 13/09 tem a diária + a once que vence nesse dia.
    expect(next7.find((b) => b.date === '2026-09-13')?.action_ids.sort()).toEqual(['a2', 'a3']);
  });

  it('ocorrência recorrente já concluída no dia não conta como atrasada', () => {
    const feita: AgendaAction = {
      ...a2,
      completions: {
        '2026-09-03': { by: U2, at: '2026-09-03T12:00:00.000Z' },
        '2026-09-04': { by: U2, at: '2026-09-04T12:00:00.000Z' },
      },
    };
    const { late } = service.computeAgenda({ ...base, actions: [feita] });
    expect(late).toEqual([{ action_id: 'a2', date: '2026-09-05', days_late: 5 }]);
  });

  it('recorrente em dia nos últimos 7 dias não aparece no atrasado', () => {
    const completions: Record<string, { by: string; at: string }> = {};
    for (const d of [
      '2026-09-03',
      '2026-09-04',
      '2026-09-05',
      '2026-09-06',
      '2026-09-07',
      '2026-09-08',
      '2026-09-09',
    ]) {
      completions[d] = { by: U2, at: `${d}T12:00:00.000Z` };
    }
    const { late } = service.computeAgenda({ ...base, actions: [{ ...a2, completions }] });
    expect(late.some((l) => l.action_id === 'a2')).toBe(false);
  });

  it('filtro por pessoa vale para atrasado/hoje/próximos, mas não para a carga', () => {
    const somenteU1 = service.computeAgenda({ ...base, person: U1 });

    expect(somenteU1.late.map((l) => l.action_id)).toEqual(['a1']);
    expect(somenteU1.today).toEqual([]);
    expect(somenteU1.next7).toEqual([{ date: '2026-09-13', action_ids: ['a3'] }]);
    // carga é sempre de todo mundo (regra do protótipo)
    expect(somenteU1.load).toEqual([
      { user_id: U1, count: 0 },
      { user_id: U2, count: 1 },
    ]);
  });

  it('carga do dia ignora o que já foi concluído hoje', () => {
    const feitaHoje: AgendaAction = {
      ...a2,
      completions: { [HOJE]: { by: U2, at: '2026-09-10T12:00:00.000Z' } },
    };
    const { load } = service.computeAgenda({ ...base, actions: [a1, feitaHoje, a3] });
    expect(load).toEqual([
      { user_id: U1, count: 0 },
      { user_id: U2, count: 0 },
    ]);
  });

  it('by_date cobre from..to inclusive e fica vazio sem intervalo', () => {
    const semIntervalo = service.computeAgenda(base);
    expect(semIntervalo.by_date).toEqual({});

    const { by_date } = service.computeAgenda({ ...base, from: '2026-09-12', to: '2026-09-14' });
    expect(Object.keys(by_date)).toEqual(['2026-09-12', '2026-09-13', '2026-09-14']);
    expect(by_date['2026-09-13']?.sort()).toEqual(['a2', 'a3']);
    expect(by_date['2026-09-12']).toEqual(['a2']);
  });

  it('atrasado/hoje/próximos não dependem de from/to (sempre relativos a hoje)', () => {
    const comIntervalo = service.computeAgenda({ ...base, from: '2026-10-01', to: '2026-10-05' });
    expect(comIntervalo.late).toEqual(service.computeAgenda(base).late);
    expect(comIntervalo.today).toEqual(service.computeAgenda(base).today);
  });
});
