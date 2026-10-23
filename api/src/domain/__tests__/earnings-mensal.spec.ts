/**
 * Bônus por período mensal (L11, contrato §43) — regras puras. A v1 (dia/semana) fica congelada nos testes de antes
 * (`earnings-rules.spec.ts`, `modo-completo-caracterizacao.spec.ts`); aqui só o que é novo.
 */
import {
  alvosDaSemana,
  calcularDia,
  calcularMes,
  calcularSemana,
  chaveTrabalho,
  lerRegraSalva,
  mesDoDia,
  planejarLancamentos,
  REGRA_PADRAO,
  semanaDoMes,
  ultimoDiaDoMes,
  validarRegra,
  validarVigencia,
  type EntradaDia,
  type RegraBruta,
  type VersaoRegra,
} from '../earnings-rules';

const MENSAL: RegraBruta = {
  ...REGRA_PADRAO,
  tiers_period: 'month',
  combine: 'sum',
  tiers: [
    { min_signups: 20, amount_cents: 15000 },
    { min_signups: 40, amount_cents: 30000 },
  ],
};
const v = (version: number, valid_from: string, config: RegraBruta): VersaoRegra => ({ version, valid_from, config });
const dia = (d: string, signups: number, o: Partial<EntradaDia> = {}): EntradaDia => ({ dia: d, signups, visits: 0, journey_open: true, elegivel: true, ...o });
/** Outubro de 2026 com 42 cadastros espalhados por 5 semanas (01/10 é quinta; 31/10 é sábado). */
function outubro(): Record<string, EntradaDia> {
  const e: Record<string, EntradaDia> = {};
  const n: Array<[string, number]> = [
    ['2026-10-01', 5],
    ['2026-10-02', 3],
    ['2026-10-08', 7],
    ['2026-10-15', 6],
    ['2026-10-21', 9],
    ['2026-10-28', 8],
    ['2026-10-31', 4],
  ];
  for (const [d, s] of n) e[d] = dia(d, s);
  // dias de setembro e novembro na mesma semana não contam no mês
  e['2026-09-30'] = dia('2026-09-30', 50);
  e['2026-11-01'] = dia('2026-11-01', 50);
  return e;
}

describe('validação da regra mensal', () => {
  it('sem a opção (flag desligada), "month" continua inválido com a frase de hoje', () => {
    expect(validarRegra(MENSAL)).toEqual({ ok: false, campo: 'tiers_period', erro: 'tiers_period: use day ou week.' });
    expect(validarRegra({ ...REGRA_PADRAO, tiers_period: 'ano' })).toEqual({ ok: false, campo: 'tiers_period', erro: 'tiers_period: use day ou week.' });
  });
  it('com a opção: aceita month com combine sum ou tier_only e sem teto', () => {
    expect(validarRegra(MENSAL, { mensal: true })).toEqual({ ok: true, regra: MENSAL });
    expect(validarRegra({ ...MENSAL, combine: 'tier_only' }, { mensal: true }).ok).toBe(true);
    expect(validarRegra({ ...REGRA_PADRAO, tiers_period: 'ano' }, { mensal: true })).toMatchObject({ ok: false, erro: 'tiers_period: use day, week ou month.' });
  });
  it('com month: combine max e teto são recusados com o campo', () => {
    expect(validarRegra({ ...MENSAL, combine: 'max' }, { mensal: true })).toMatchObject({ ok: false, campo: 'combine' });
    expect(validarRegra({ ...MENSAL, cap_cents: 50000 }, { mensal: true })).toMatchObject({ ok: false, campo: 'cap_cents' });
  });
  it('a regra salva mensal é lida (ler nunca depende da flag); a v1 continua igual', () => {
    expect(lerRegraSalva(MENSAL)).toEqual(MENSAL);
    expect(lerRegraSalva(REGRA_PADRAO)).toEqual(REGRA_PADRAO);
  });
  it('vigência: com mês na nova ou na vigente, só começa no dia 1', () => {
    const base = { hoje: '2026-10-23', semanaTravada: false };
    const v1 = [v(1, '1970-01-01', REGRA_PADRAO)];
    expect(validarVigencia({ ...base, valid_from: '2026-11-02', nova: MENSAL, versoes: v1 })).toMatchObject({ code: 'VALIDATION_ERROR', campo: 'valid_from' });
    expect(validarVigencia({ ...base, valid_from: '2026-11-01', nova: MENSAL, versoes: v1 })).toBeNull();
    const comMes = [...v1, v(2, '2026-11-01', MENSAL)];
    expect(validarVigencia({ ...base, valid_from: '2026-11-10', nova: REGRA_PADRAO, versoes: comMes })).toMatchObject({ campo: 'valid_from' });
    expect(validarVigencia({ ...base, valid_from: '2026-12-01', nova: REGRA_PADRAO, versoes: comMes })).toBeNull();
    // sem mês nenhum: a regra de hoje (qualquer dia ≥ hoje)
    expect(validarVigencia({ ...base, valid_from: '2026-10-29', nova: REGRA_PADRAO, versoes: v1 })).toBeNull();
  });
});

describe('datas do mês', () => {
  it('último dia, mês do dia e a semana que contém o último dia', () => {
    expect(ultimoDiaDoMes('2026-10')).toBe('2026-10-31');
    expect(ultimoDiaDoMes('2026-02')).toBe('2026-02-28');
    expect(ultimoDiaDoMes('2028-02')).toBe('2028-02-29');
    expect(mesDoDia('2026-10-23')).toBe('2026-10');
    expect(semanaDoMes('2026-10', 1)).toBe('2026-10-26');
    // novembro de 2026 termina numa segunda: a semana é a que começa nela
    expect(semanaDoMes('2026-11', 1)).toBe('2026-11-30');
    expect(semanaDoMes('2026-11', 0)).toBe('2026-11-29');
  });
});

describe('calcularMes', () => {
  const versoes = [v(1, '1970-01-01', REGRA_PADRAO), v(2, '2026-10-01', MENSAL)];
  it('mês que atravessa 5 semanas: conta só os dias do mês, pela versão do dia 1', () => {
    const m = calcularMes({ mes: '2026-10', hoje: '2026-11-02', versoes, entradas: outubro(), weekStart: 1 });
    expect(m).toMatchObject({
      mes: '2026-10',
      from: '2026-10-01',
      to: '2026-10-31',
      rule_version: 2,
      signups: 42,
      month_part_cents: 30000,
      faixa: { min_signups: 40, amount_cents: 30000 },
      proxima_faixa: null,
      encerrado: true,
      work_week: '2026-10-26',
    });
    expect(m?.conta.join(' ')).toContain('42 cadastros confirmados');
    expect(m?.conta.join(' ')).toContain('R$ 300,00');
  });
  it('mês em andamento: até hoje, com a próxima faixa', () => {
    const m = calcularMes({ mes: '2026-10', hoje: '2026-10-21', versoes, entradas: outubro(), weekStart: 1 });
    expect(m).toMatchObject({ signups: 30, month_part_cents: 15000, encerrado: false, proxima_faixa: { min_signups: 40, amount_cents: 30000, faltam: 10 } });
  });
  it('dia 1 sem regra mensal = sem parte do mês', () => {
    expect(calcularMes({ mes: '2026-09', hoje: '2026-10-21', versoes, entradas: outubro(), weekStart: 1 })).toBeNull();
    expect(calcularMes({ mes: '2026-12', hoje: '2026-10-21', versoes, entradas: {}, weekStart: 1 })).toBeNull();
  });
  it('metas cumulativas somam; tier_only não paga o valor por cadastro nos dias', () => {
    const cum = [v(1, '1970-01-01', { ...MENSAL, tiers_mode: 'cumulative', combine: 'tier_only' })];
    const m = calcularMes({ mes: '2026-10', hoje: '2026-11-02', versoes: cum, entradas: outubro(), weekStart: 1 });
    expect(m?.month_part_cents).toBe(45000);
    expect(calcularDia({ ...MENSAL, combine: 'tier_only' }, dia('2026-10-08', 7)).total_cents).toBe(0);
  });
  it('dia com regra mensal: n × valor, piso e diária; sem faixa nem teto no dia', () => {
    const d = calcularDia({ ...MENSAL, floor_cents: 5000, floor_condition: 'journey_open' }, dia('2026-10-08', 7));
    expect(d.total_cents).toBe(7000);
    expect(d.faixa).toBeNull();
    expect(calcularDia({ ...MENSAL, floor_cents: 9000, floor_condition: 'journey_open' }, dia('2026-10-08', 7)).total_cents).toBe(9000);
  });
});

describe('a semana que contém o último dia leva a parte do mês', () => {
  const versoes = [v(1, '1970-01-01', REGRA_PADRAO), v(2, '2026-10-01', MENSAL)];
  it('semana 26/10–01/11: dias + bônus do mês; alvo month com a chave acc:month:2026-10', () => {
    const entradas = outubro();
    const mes = calcularMes({ mes: '2026-10', hoje: '2026-11-02', versoes, entradas, weekStart: 1 });
    const s = calcularSemana({ from: '2026-10-26', to: '2026-11-01', hoje: '2026-11-02', versoes, entradas, mes });
    expect(s.days_cents).toBe((8 + 4) * 1000 + 50 * 1000);
    expect(s.week_part_cents).toBe(0);
    expect(s.month).toMatchObject({ mes: '2026-10', month_part_cents: 30000 });
    expect(s.total_cents).toBe(s.days_cents + 30000);
    expect(s.conta.join(' ')).toContain('Bônus do mês de outubro');
    const alvos = alvosDaSemana(s);
    const alvoMes = alvos.find((a) => a.scope === 'month');
    expect(alvoMes).toEqual({ scope: 'month', work_day: '2026-10-01', work_week: '2026-10-26', cents: 30000, rule_version: 2 });
    expect(chaveTrabalho('month', '2026-10-01', '2026-10-26')).toBe('month:2026-10');
    const plano = planejarLancamentos(alvos, new Map());
    expect(plano.find((p) => p.scope === 'month')?.idempotency_key).toBe('acc:month:2026-10:1');
    // já lançado 15000 (tardia): delta 15000 com n = 2
    const lancado = new Map([['month:2026-10', { soma: 15000, qtd: 1 }]]);
    expect(planejarLancamentos(alvos, lancado).find((p) => p.scope === 'month')).toMatchObject({ delta_cents: 15000, idempotency_key: 'acc:month:2026-10:2' });
  });
  it('sem mês: a semana sai idêntica (sem a chave month nem alvo novo)', () => {
    const entradas = outubro();
    const a = calcularSemana({ from: '2026-10-19', to: '2026-10-25', hoje: '2026-11-02', versoes, entradas });
    const b = calcularSemana({ from: '2026-10-19', to: '2026-10-25', hoje: '2026-11-02', versoes, entradas, mes: null });
    expect(b).toEqual(a);
    expect('month' in a).toBe(false);
    expect(alvosDaSemana(a).map((x) => x.scope)).toEqual(['day', 'day', 'day', 'day', 'day', 'day', 'day', 'week']);
  });
});
