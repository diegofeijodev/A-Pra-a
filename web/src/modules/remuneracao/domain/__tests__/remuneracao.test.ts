import { describe, expect, it } from 'vitest';
import {
  brl,
  centavosDeTexto,
  corpoSimulacao,
  extratoSchema,
  formParaRegra,
  ganhosCampoSchema,
  proximoInicioDeSemana,
  regraParaForm,
  resumoRegra,
  rotuloDia,
  rotuloSemana,
  sugerirInicio,
  textoDeCentavos,
  tituloSimulacao,
  type RegraRemuneracao,
} from '../remuneracao';

const PADRAO: RegraRemuneracao = {
  unit_cents: 1000,
  tiers_period: 'day',
  tiers: [
    { min_signups: 10, amount_cents: 10000 },
    { min_signups: 20, amount_cents: 25000 },
  ],
  combine: 'max',
  cap_cents: null,
  floor_cents: 0,
  floor_condition: 'none',
  floor_min_visits: 0,
  visits_count: 'checkin',
  week_start_weekday: 1,
  payout_weekday: 1,
  autoclose_hour: 6,
  late_grace_days: 14,
};

describe('brl (centavos inteiros)', () => {
  it('formata sem ponto flutuante', () => {
    expect(brl(0)).toBe('R$ 0,00');
    expect(brl(7)).toBe('R$ 0,07');
    expect(brl(1000)).toBe('R$ 10,00');
    expect(brl(2500000)).toBe('R$ 25.000,00');
    expect(brl(123456789)).toBe('R$ 1.234.567,89');
    expect(brl(-2500)).toBe('-R$ 25,00');
  });
  it('0,1 + 0,2 não vira 30,000000000000004: soma é em centavos', () => {
    expect(brl(10 + 20)).toBe('R$ 0,30');
  });
});

describe('centavosDeTexto', () => {
  it.each([
    ['10', 1000],
    ['10,5', 1050],
    ['10,50', 1050],
    ['0,07', 7],
    ['1.234,50', 123450],
    ['R$ 100,00', 10000],
    ['1.000', 100000],
    ['0', 0],
  ])('%s → %i', (txt, cents) => {
    expect(centavosDeTexto(txt)).toBe(cents);
  });
  it.each(['', 'abc', '10,555', '10.5', '-5', '1,2,3', '1.23', '10 reais'])('rejeita %j', (txt) => {
    expect(centavosDeTexto(txt)).toBeNull();
  });
  it('ida e volta', () => {
    for (const c of [0, 1, 99, 100, 1050, 123456, 100000000]) expect(centavosDeTexto(textoDeCentavos(c))).toBe(c);
  });
});

describe('datas', () => {
  it('rótulos', () => {
    expect(rotuloDia('2026-10-26')).toBe('seg 26/10');
    expect(rotuloDia('2026-10-25')).toBe('dom 25/10');
    expect(rotuloSemana('2026-10-19', '2026-10-25')).toBe('19/10 a 25/10');
  });
  it('próximo início de semana e sugestão de vigência', () => {
    expect(proximoInicioDeSemana('2026-10-26', 1)).toBe('2026-10-26');
    expect(proximoInicioDeSemana('2026-10-27', 1)).toBe('2026-11-02');
    expect(proximoInicioDeSemana('2026-10-27', 0)).toBe('2026-11-01');
    expect(sugerirInicio('2026-10-27', PADRAO)).toBe('2026-10-27');
    expect(sugerirInicio('2026-10-27', { ...PADRAO, tiers_period: 'week' })).toBe('2026-11-02');
  });
});

describe('formulário ⇄ regra', () => {
  it('o padrão faz ida e volta sem perder nada', () => {
    const f = regraParaForm(PADRAO);
    expect(f.unit).toBe('10,00');
    expect(f.tiers).toEqual([
      { min: '10', valor: '100,00' },
      { min: '20', valor: '250,00' },
    ]);
    expect(f.cap).toBe('');
    expect(formParaRegra(f)).toEqual({ ok: true, regra: PADRAO });
  });
  it('teto, piso e condição viram centavos inteiros', () => {
    const f = { ...regraParaForm(PADRAO), cap: '300', floor: '100,00', floor_condition: 'min_visits' as const, floor_min_visits: '10' };
    expect(formParaRegra(f)).toMatchObject({ ok: true, regra: { cap_cents: 30000, floor_cents: 10000, floor_condition: 'min_visits', floor_min_visits: 10 } });
  });
  it('mensagens de erro dizem o campo e como corrigir', () => {
    const base = regraParaForm(PADRAO);
    expect(formParaRegra({ ...base, unit: 'dez' })).toMatchObject({ ok: false, campo: 'unit' });
    expect(formParaRegra({ ...base, tiers: [{ min: 'x', valor: '1' }] })).toMatchObject({ ok: false, campo: 'tiers', erro: 'Faixa 1: informe a quantidade de cadastros (número inteiro).' });
    expect(formParaRegra({ ...base, tiers: [{ min: '5', valor: 'abc' }] })).toMatchObject({ ok: false, campo: 'tiers' });
    expect(formParaRegra({ ...base, cap: '1,234' })).toMatchObject({ ok: false, campo: 'cap' });
    expect(formParaRegra({ ...base, floor: '??' })).toMatchObject({ ok: false, campo: 'floor' });
    expect(formParaRegra({ ...base, autoclose_hour: '' })).toMatchObject({ ok: false, campo: 'autoclose_hour' });
  });
  it('piso em branco = sem piso', () => {
    expect(formParaRegra({ ...regraParaForm(PADRAO), floor: '' })).toMatchObject({ ok: true, regra: { floor_cents: 0 } });
  });
});

describe('resumoRegra (a regra em palavras)', () => {
  it('padrão', () => {
    const t = resumoRegra(PADRAO);
    expect(t).toContain('Cada cadastro confirmado pelo Freela vale R$ 10,00.');
    expect(t).toContain('Faixas no dia: 10 cadastros = R$ 100,00; 20 cadastros = R$ 250,00.');
    expect(t).toContain('Vale o maior entre o valor por cadastro e a faixa atingida.');
    expect(t).toContain('Sem piso por diária.');
    expect(t.at(-2)).toBe('Semana de segunda a domingo (Brasília); Pix toda segunda, fechamento automático a partir das 6h.');
  });
  it('só faixa, semanal, teto e piso com visitas', () => {
    const t = resumoRegra({ ...PADRAO, combine: 'tier_only', tiers_period: 'week', cap_cents: 50000, floor_cents: 8000, floor_condition: 'min_visits', floor_min_visits: 1, visits_count: 'checkout' });
    expect(t[0]).toBe('O valor por cadastro não é usado: só vale a faixa atingida.');
    expect(t).toContain('Faixas na semana: 10 cadastros = R$ 100,00; 20 cadastros = R$ 250,00.');
    expect(t).toContain('Teto por semana: R$ 500,00.');
    expect(t).toContain('Piso por diária: R$ 80,00, nos dias com ao menos 1 visita (contadas só com checkout).');
  });
  it('piso sem condição avisa que paga todo dia', () => {
    expect(resumoRegra({ ...PADRAO, floor_cents: 10000 })).toContain('Piso por diária: R$ 100,00, todo dia, para representante ativo (mesmo sem visitas).');
  });
});

describe('simulador', () => {
  const f = regraParaForm(PADRAO);
  it('monta o corpo com números inteiros; inválido = null (nada é enviado)', () => {
    expect(corpoSimulacao(f, { signups: '12', visits: '', journey_open: false })).toEqual({ config: PADRAO, signups_confirmed: 12, visits: 0, journey_open: false });
    expect(corpoSimulacao(f, { signups: '', visits: '0', journey_open: false })).toBeNull();
    expect(corpoSimulacao(f, { signups: '1,5', visits: '0', journey_open: false })).toBeNull();
    expect(corpoSimulacao(f, { signups: '1001', visits: '0', journey_open: false })).toBeNull();
    expect(corpoSimulacao({ ...f, unit: 'x' }, { signups: '3', visits: '0', journey_open: true })).toBeNull();
  });
  it('título', () => {
    expect(tituloSimulacao(12, 12000)).toBe('Com 12 cadastros confirmados num dia, o representante ganha R$ 120,00.');
    expect(tituloSimulacao(1, 1000)).toBe('Com 1 cadastro confirmado num dia, o representante ganha R$ 10,00.');
  });
});

describe('contrato do fio (zod)', () => {
  it('aceita a resposta do consultor do contrato §28.6', () => {
    const r = ganhosCampoSchema.safeParse({
      rule_version: 1, confirmation_rule: 'activated', source: 's', as_of: '2026-10-27T13:00:00.000Z',
      today: { day: '2026-10-27', total_cents: 12000, confirmed_signups: 12, visits: 3, journey_open: true, conta: ['a'] },
      week: { from: '2026-10-26', to: '2026-11-01', total_cents: 15000, extras_cents: 0, days: [{ day: '2026-10-26', total_cents: 3000, confirmed_signups: 3 }], conta: ['b'] },
      unconfirmed: { count: 2, text: 't' },
      pix: { date: '2026-11-02', week_to: '2026-11-01', text: 'p' },
      previous_weeks: [{ from: '2026-10-19', to: '2026-10-25', total_cents: 0, status: 'open' }],
    });
    expect(r.success).toBe(true);
  });
  it('recusa dinheiro fracionado no fio', () => {
    const r = ganhosCampoSchema.safeParse({
      rule_version: 1, confirmation_rule: 'a', source: 's', as_of: 'x',
      today: { day: 'd', total_cents: 10.5, confirmed_signups: 1, visits: 0, journey_open: false, conta: [] },
      week: { from: 'a', to: 'b', total_cents: 0, extras_cents: 0, days: [], conta: [] },
      unconfirmed: { count: 0, text: '' }, pix: { date: 'd', week_to: 'd', text: '' }, previous_weeks: [],
    });
    expect(r.success).toBe(false);
  });
  it('extrato da equipe aceita ledger opcional', () => {
    const r = extratoSchema.safeParse({ week: { from: 'a', to: 'b' }, source: 's', rule_version: 1, confirmation_rule: 'activated', total_cents: 0, consultants: [] });
    expect(r.success).toBe(true);
  });
});

describe('modo do chefe (S2/S3, contrato §32)', () => {
  const CHEFE: RegraRemuneracao = {
    ...PADRAO,
    unit_cents: 1000,
    tiers_period: 'week',
    tiers: [{ min_signups: 5, amount_cents: 20000 }],
    combine: 'sum',
    signup_source: 'declared',
    daily_base_cents: 10000,
    daily_base_condition: 'route_assigned',
    daily_base_min_visits: 0,
    daily_base_requires_journey: false,
    tiers_mode: 'cumulative',
    declared_daily_cap: 30,
    declared_confirm_days: null,
  };

  it('a regra antiga sai com as MESMAS 13 chaves (nenhuma chave nova no corpo do PUT)', () => {
    const r = formParaRegra(regraParaForm(PADRAO));
    expect(r.ok && Object.keys(r.regra).sort()).toEqual(Object.keys(PADRAO).sort());
  });
  it('a resposta do servidor com as chaves novas nulas ou ausentes continua gerando o mesmo corpo', () => {
    const comNulas = { ...PADRAO, signup_source: null, daily_base_cents: null, tiers_mode: null, declared_daily_cap: null };
    expect(formParaRegra(regraParaForm(comNulas))).toEqual({ ok: true, regra: PADRAO });
  });
  it('o perfil do chefe faz ida e volta e manda só as chaves que mudam', () => {
    const f = regraParaForm(CHEFE);
    expect(f).toMatchObject({ signup_source: 'declared', declared_cap: '30', daily: '100,00', daily_condition: 'route_assigned', daily_requires_journey: false, tiers_mode: 'cumulative' });
    expect(formParaRegra(f)).toEqual({
      ok: true,
      regra: { ...PADRAO, unit_cents: 1000, tiers_period: 'week', tiers: [{ min_signups: 5, amount_cents: 20000 }], combine: 'sum', signup_source: 'declared', declared_daily_cap: 30, daily_base_cents: 10000, daily_base_condition: 'route_assigned', daily_base_requires_journey: false, tiers_mode: 'cumulative' },
    });
  });
  it('diária zerada não manda a condição (rotas desligadas não derrubam o PUT)', () => {
    const f = { ...regraParaForm(CHEFE), daily: '0' };
    const r = formParaRegra(f);
    expect(r.ok && r.regra).not.toHaveProperty('daily_base_condition');
  });
  it('erros dizem o campo', () => {
    const base = regraParaForm(CHEFE);
    expect(formParaRegra({ ...base, daily: 'x' })).toMatchObject({ ok: false, campo: 'daily' });
    expect(formParaRegra({ ...base, declared_cap: 'x' })).toMatchObject({ ok: false, campo: 'declared_cap' });
  });
  it('a regra em palavras diz declarado, diária e metas que somam', () => {
    const t = resumoRegra(CHEFE).join(' ');
    expect(t).toContain('declarado pelo representante na visita vale R$ 10,00 (até 30 por dia)');
    expect(t).toContain('Todas as metas atingidas somam');
    expect(t).toContain('Diária de R$ 100,00, nos dias com rota da equipe atribuída');
  });
  it('a regra antiga continua com as mesmas frases', () => {
    const t = resumoRegra(PADRAO).join(' ');
    expect(t).toContain('Cada cadastro confirmado pelo Freela vale R$ 10,00.');
    expect(t).not.toMatch(/Diária|declarado|somam/);
  });
  it('o corpo do simulador da semana (vetor R$ 350) leva os dias e a rota', () => {
    const f = regraParaForm(CHEFE);
    const c = corpoSimulacao(f, { signups: '0', visits: '0', journey_open: false, days: [{ signups: '5', route_assigned: true }] });
    expect(c?.days).toEqual([{ signups: 5, route_assigned: true, journey_open: false }]);
    expect(corpoSimulacao(f, { signups: '0', visits: '0', journey_open: false, days: [{ signups: 'x', route_assigned: true }] })).toBeNull();
    expect(corpoSimulacao(regraParaForm(PADRAO), { signups: '12', visits: '0', journey_open: true })).not.toHaveProperty('days');
  });
});
