import {
  actionEverDone,
  dueDateOf,
  isDoneOn,
  occursOn,
  recFromRow,
  recLabel,
  recToRow,
  stepInfo,
  type Rec,
  type RecAction,
  type StepPraca,
} from '../recurrence';

// Praça de referência dos casos do brief: começa em 01/09/2026 (uma terça).
const PRACA: StepPraca = { start_date: '2026-09-01', steps: {} };

const acao = (rec: Rec, extra: Partial<RecAction> = {}): RecAction => ({
  step: 1,
  rec,
  due_override: null,
  completed_at: null,
  completions: {},
  ...extra,
});

describe('recFromRow / recToRow', () => {
  it('vai e volta de colunas rec_* para Rec sem perder campo', () => {
    const recs: Rec[] = [
      { kind: 'once', day: 3 },
      { kind: 'daily', start_day: 20 },
      { kind: 'weekday', start_day: 5, end_day: 12 },
      { kind: 'weekly', weekday: 2, start_day: 61 },
      { kind: 'monthly', month_day: 1, start_day: 74 },
    ];
    for (const rec of recs) expect(recFromRow(recToRow(rec))).toEqual(rec);
  });

  it('linha sem end_day não inventa end_day', () => {
    const rec = recFromRow(recToRow({ kind: 'daily', start_day: 0 }));
    expect(rec).toEqual({ kind: 'daily', start_day: 0 });
    expect('end_day' in rec).toBe(false);
  });
});

describe('dueDateOf', () => {
  it('once = start_date + day; recorrente = ""', () => {
    expect(dueDateOf(acao({ kind: 'once', day: 3 }), PRACA)).toBe('2026-09-04');
    expect(dueDateOf(acao({ kind: 'daily', start_day: 0 }), PRACA)).toBe('');
  });

  it('due_override manda mais que start_date + day (ação adiada)', () => {
    const a = acao({ kind: 'once', day: 3 }, { due_override: '2026-09-30' });
    expect(dueDateOf(a, PRACA)).toBe('2026-09-30');
  });
});

describe('occursOn', () => {
  it('once só cai no dia devido', () => {
    const a = acao({ kind: 'once', day: 3 });
    expect(occursOn(a, PRACA, '2026-09-04')).toBe(true);
    expect(occursOn(a, PRACA, '2026-09-05')).toBe(false);
  });

  it('weekday start 5 end 12: cai na segunda 07/09, não no sábado 05/09 nem depois do fim (14/09)', () => {
    const a = acao({ kind: 'weekday', start_day: 5, end_day: 12 });
    expect(occursOn(a, PRACA, '2026-09-07')).toBe(true); // segunda, dentro da janela
    expect(occursOn(a, PRACA, '2026-09-05')).toBe(false); // sábado (e antes do início)
    expect(occursOn(a, PRACA, '2026-09-12')).toBe(false); // sábado, dentro da janela
    expect(occursOn(a, PRACA, '2026-09-14')).toBe(false); // segunda, mas depois do end_day
  });

  it('weekly weekday 2 start 61: só terças a partir de 01/11', () => {
    const a = acao({ kind: 'weekly', weekday: 2, start_day: 61 });
    expect(occursOn(a, PRACA, '2026-11-03')).toBe(true); // terça
    expect(occursOn(a, PRACA, '2026-11-04')).toBe(false); // quarta
    expect(occursOn(a, PRACA, '2026-10-27')).toBe(false); // terça, antes do início
  });

  it('monthly month_day 1 start 74: cai em 01/12', () => {
    const a = acao({ kind: 'monthly', month_day: 1, start_day: 74 });
    expect(occursOn(a, PRACA, '2026-12-01')).toBe(true);
    expect(occursOn(a, PRACA, '2026-12-02')).toBe(false);
    expect(occursOn(a, PRACA, '2026-11-01')).toBe(false); // antes do início (14/11)
  });

  it('ação fixa (step 0) rola todo dia, inclusive antes do início da praça', () => {
    const fixa = acao({ kind: 'daily', start_day: 0 }, { step: 0 });
    const daEtapa = acao({ kind: 'daily', start_day: 0 }, { step: 4 });
    expect(occursOn(fixa, PRACA, '2026-08-15')).toBe(true);
    expect(occursOn(daEtapa, PRACA, '2026-08-15')).toBe(false);
  });

  it('ação fixa ainda respeita o end_day', () => {
    const fixa = acao({ kind: 'weekday', start_day: 0, end_day: 2 }, { step: 0 });
    expect(occursOn(fixa, PRACA, '2026-09-02')).toBe(true);
    expect(occursOn(fixa, PRACA, '2026-09-04')).toBe(false);
  });
});

describe('isDoneOn / actionEverDone', () => {
  it('once olha completed_at; recorrente olha a data em completions', () => {
    const feita = acao({ kind: 'once', day: 1 }, { completed_at: new Date('2026-09-02T12:00:00Z') });
    expect(isDoneOn(feita, '2026-09-02')).toBe(true);
    expect(actionEverDone(feita)).toBe(true);

    const rec = acao(
      { kind: 'daily', start_day: 0 },
      {
        completions: { '2026-09-03': { by: 'u1', at: '2026-09-03T12:00:00.000Z' } },
      },
    );
    expect(isDoneOn(rec, '2026-09-03')).toBe(true);
    expect(isDoneOn(rec, '2026-09-04')).toBe(false);
    expect(actionEverDone(rec)).toBe(true);
    expect(actionEverDone(acao({ kind: 'daily', start_day: 0 }))).toBe(false);
  });
});

describe('recLabel', () => {
  it('rótulos em pt-BR iguais aos do protótipo', () => {
    expect(recLabel(acao({ kind: 'once', day: 3 }), PRACA)).toBe('04/09/2026');
    expect(recLabel(acao({ kind: 'daily', start_day: 0 }), PRACA)).toBe('todo dia');
    expect(recLabel(acao({ kind: 'weekday', start_day: 0 }), PRACA)).toBe('dia útil');
    expect(recLabel(acao({ kind: 'weekly', weekday: 2, start_day: 0 }), PRACA)).toBe('toda terça');
    expect(recLabel(acao({ kind: 'monthly', month_day: 1, start_day: 0 }), PRACA)).toBe('todo dia 1');
  });
});

describe('stepInfo', () => {
  const acoesDaEtapa3 = [
    acao({ kind: 'once', day: 16 }, { step: 3 }),
    acao({ kind: 'once', day: 27 }, { step: 3 }),
  ];

  it('etapa 3 fica travada enquanto a 2 não bate o portão', () => {
    const info = stepInfo(PRACA, acoesDaEtapa3, 3);
    expect(info.status).toBe('locked');
    expect(info.lock_reason).toMatch(/^Falta bater o Portão/);
    expect(info.total).toBe(2);
    expect(info.done).toBe(0);
    expect(info.window).toEqual(['2026-09-17', '2026-09-28']);
  });

  it('etapa 3 continua travada com resultado abaixo do portão (22 < 40)', () => {
    const praca: StepPraca = { start_date: '2026-09-01', steps: { 2: { actual: 22 } } };
    const info = stepInfo(praca, acoesDaEtapa3, 3);
    expect(info.status).toBe('locked');
    expect(info.lock_reason).toBe('Falta bater o Portão: 40 garçons confirmados. Hoje: 22');
  });

  it('destrave manual solta a etapa 3 mesmo sem o portão', () => {
    const praca: StepPraca = {
      start_date: '2026-09-01',
      steps: { 3: { unlock: { by: 'u1', at: '2026-09-10T12:00:00.000Z', reason: 'decisão do Diego' } } },
    };
    const info = stepInfo(praca, acoesDaEtapa3, 3);
    expect(info.status).toBe('todo');
    expect(info.lock_reason).toBeNull();
    expect(info.unlock?.reason).toBe('decisão do Diego');
  });

  it('bater o portão da 2 também solta a 3', () => {
    const praca: StepPraca = { start_date: '2026-09-01', steps: { 2: { actual: 41 } } };
    expect(stepInfo(praca, acoesDaEtapa3, 3).status).toBe('todo');
  });

  it('parcialmente concluída = active; tudo concluído + resultado = done', () => {
    const praca: StepPraca = { start_date: '2026-09-01', steps: { 2: { actual: 41 } } };
    const parcial = [
      acao({ kind: 'once', day: 16 }, { step: 3, completed_at: new Date('2026-09-17T12:00:00Z') }),
      acao({ kind: 'once', day: 27 }, { step: 3 }),
    ];
    expect(stepInfo(praca, parcial, 3).status).toBe('active');
    expect(stepInfo(praca, parcial, 3).done).toBe(1);

    const todas = parcial.map((a) => ({ ...a, completed_at: new Date('2026-09-17T12:00:00Z') }));
    expect(stepInfo(praca, todas, 3).status).toBe('active'); // ainda sem resultado lançado
    const comResultado: StepPraca = {
      start_date: '2026-09-01',
      steps: { 2: { actual: 41 }, 3: { actual: 10 } },
    };
    expect(stepInfo(comResultado, todas, 3).status).toBe('done');
  });

  it('etapa sem ação nenhuma: window null, total 0', () => {
    const info = stepInfo(PRACA, [], 1);
    expect(info.total).toBe(0);
    expect(info.window).toBeNull();
    expect(info.status).toBe('todo');
    expect(info.name).toBe('Mapear a região');
    expect(info.gate).toBeNull();
  });
});
