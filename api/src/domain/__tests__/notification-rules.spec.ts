import { buildNotifications, type BuildNotificationsInput, type NotifAction } from '../notification-rules';

const PRACA_ID = '00000000-0000-4000-8000-0000000000p1';

const PRACA = { id: PRACA_ID, name: 'Belo Horizonte', start_date: '2026-01-01' };
const TODAY = '2026-01-10'; // amanhã = 2026-01-11
const NOW = new Date('2026-01-10T12:00:00Z');

const acao = (over: Partial<NotifAction> = {}): NotifAction => ({
  id: 'a1',
  title: 'Ligar para os PDVs',
  step: 1,
  rec: { kind: 'daily', start_day: 0 },
  due_override: null,
  completed_at: null,
  completions: {},
  ...over,
});

const base = (over: Partial<BuildNotificationsInput> = {}): BuildNotificationsInput => ({
  praca: PRACA,
  today: TODAY,
  now: NOW,
  actions: [],
  steps: [],
  leads: [],
  fill_hours: null,
  campanhas_acima_teto: [],
  ...over,
});

describe('buildNotifications — amanhã', () => {
  it('ação recorrente que ocorre amanhã vira aviso info', () => {
    const out = buildNotifications(base({ actions: [acao()] }));
    expect(out).toEqual([{ id: 'tmw-a1', text: 'Amanhã: Ligar para os PDVs', tone: 'info' }]);
  });

  it('ação once NUNCA vira aviso de amanhã, mesmo devida amanhã', () => {
    const once = acao({ rec: { kind: 'once', day: 0 }, due_override: '2026-01-11' });
    expect(buildNotifications(base({ actions: [once] }))).toEqual([]);
  });

  it('ação recorrente que não ocorre amanhã (fora da janela) não aparece', () => {
    const fora = acao({ rec: { kind: 'daily', start_day: 0, end_day: 5 } });
    expect(buildNotifications(base({ actions: [fora] }))).toEqual([]);
  });
});

describe('buildNotifications — etapas travadas/paradas', () => {
  it('etapa locked vira aviso warn com o motivo', () => {
    const out = buildNotifications(
      base({ steps: [{ n: 3, status: 'locked', lock_reason: 'Falta bater o Portão: 40 garçons confirmados' }] }),
    );
    expect(out).toEqual([
      { id: 'lock-3', text: 'Etapa 3 travada — Falta bater o Portão: 40 garçons confirmados', tone: 'warn' },
    ]);
  });

  it('etapa active com última conclusão há mais de 7 dias vira aviso de estagnação', () => {
    // rec `once` só pra não contaminar com um aviso "amanhã" — o que importa
    // aqui é só `completed_at`, que a regra de estagnação olha igual pros dois tipos.
    const acaoParada = acao({
      id: 'a2',
      step: 4,
      rec: { kind: 'once', day: 0 },
      completed_at: '2026-01-01T10:00:00.000Z',
    });
    const out = buildNotifications(
      base({ actions: [acaoParada], steps: [{ n: 4, status: 'active', lock_reason: null }] }),
    );
    expect(out).toEqual([
      { id: 'stall-4', text: 'Etapa 4 há 7+ dias sem ação concluída — avisar Diego', tone: 'warn' },
    ]);
  });

  it('etapa active com conclusão recente (<=7 dias) NÃO vira aviso', () => {
    const acaoRecente = acao({
      id: 'a3',
      step: 4,
      rec: { kind: 'once', day: 0 },
      completed_at: '2026-01-09T10:00:00.000Z',
    });
    const out = buildNotifications(
      base({ actions: [acaoRecente], steps: [{ n: 4, status: 'active', lock_reason: null }] }),
    );
    expect(out).toEqual([]);
  });

  it('etapa active sem NENHUMA conclusão ainda não vira aviso (nada para comparar)', () => {
    const out = buildNotifications(base({ steps: [{ n: 4, status: 'active', lock_reason: null }] }));
    expect(out).toEqual([]);
  });

  it('conclusão de recorrente (completions) também conta para o cálculo', () => {
    const acaoRec = acao({
      id: 'a4',
      step: 5,
      // `end_day` fora da janela de amanhã: só pra não contaminar com "tmw-a4".
      rec: { kind: 'daily', start_day: 0, end_day: 5 },
      completions: { '2026-01-01': { by: 'u1', at: '2026-01-01T09:00:00.000Z' } },
    });
    const out = buildNotifications(base({ actions: [acaoRec], steps: [{ n: 5, status: 'active', lock_reason: null }] }));
    expect(out).toEqual([{ id: 'stall-5', text: 'Etapa 5 há 7+ dias sem ação concluída — avisar Diego', tone: 'warn' }]);
  });

  it('etapa done/todo nunca vira aviso', () => {
    const out = buildNotifications(
      base({ steps: [{ n: 1, status: 'done', lock_reason: null }, { n: 2, status: 'todo', lock_reason: null }] }),
    );
    expect(out).toEqual([]);
  });
});

describe('buildNotifications — leads críticos', () => {
  it('lead com mais de 15 dias parado vira aviso warn', () => {
    const out = buildNotifications(base({ leads: [{ id: 'l1', name: 'Bar do Zé', stage: 3, stalled_days: 16 }] }));
    expect(out).toEqual([{ id: 'lead-l1', text: 'Lead parado há 16 dias: Bar do Zé', tone: 'warn' }]);
  });

  it('lead com exatamente 15 dias parado ainda NÃO é crítico', () => {
    const out = buildNotifications(base({ leads: [{ id: 'l2', name: 'Bar do Zé', stage: 3, stalled_days: 15 }] }));
    expect(out).toEqual([]);
  });

  it('lead na etapa 8 (perdido) nunca é crítico, mesmo muito parado', () => {
    const out = buildNotifications(base({ leads: [{ id: 'l3', name: 'Bar do Zé', stage: 8, stalled_days: 999 }] }));
    expect(out).toEqual([]);
  });
});

describe('buildNotifications — freio de preenchimento', () => {
  it('acima do limite (4h) vira aviso warn com a praça e as horas', () => {
    const out = buildNotifications(base({ fill_hours: 5.25 }));
    expect(out).toEqual([
      {
        id: `fill-${PRACA_ID}`,
        text: 'Preenchimento acima de 4 horas. Corte a mídia e volte para a captação de freelancer. (5.3h em Belo Horizonte) — avisar Diego e Mkt externo',
        tone: 'warn',
      },
    ]);
  });

  it('dentro do limite não vira aviso', () => {
    expect(buildNotifications(base({ fill_hours: 4 }))).toEqual([]);
  });

  it('sem nenhuma vaga com hora anotada (null) não vira aviso', () => {
    expect(buildNotifications(base({ fill_hours: null }))).toEqual([]);
  });
});

describe('buildNotifications — campanhas acima do teto', () => {
  it('campanha ativa acima do teto vira aviso warn', () => {
    const out = buildNotifications(base({ campanhas_acima_teto: [{ id: 'c1', name: 'BH-Contratante-Cadastro-Set26' }] }));
    expect(out).toEqual([
      { id: 'teto-c1', text: 'BH-Contratante-Cadastro-Set26 passou do teto de custo por cliente novo', tone: 'warn' },
    ]);
  });
});

describe('buildNotifications — ordem', () => {
  it('sai na ordem: amanhã, etapas, leads, freio, campanhas', () => {
    const out = buildNotifications(
      base({
        actions: [acao()],
        steps: [{ n: 3, status: 'locked', lock_reason: 'motivo' }],
        leads: [{ id: 'l1', name: 'Bar do Zé', stage: 3, stalled_days: 20 }],
        fill_hours: 10,
        campanhas_acima_teto: [{ id: 'c1', name: 'Campanha X' }],
      }),
    );
    expect(out.map((n) => n.id)).toEqual(['tmw-a1', 'lock-3', 'lead-l1', `fill-${PRACA_ID}`, 'teto-c1']);
  });
});
