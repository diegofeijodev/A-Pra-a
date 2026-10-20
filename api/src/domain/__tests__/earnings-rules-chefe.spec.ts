/**
 * Modo do chefe, S2 — regra de pagamento estendida (contrato §32).
 * Vetores de ouro da Lovable (`src/lib/financeiro.test.ts`): diária R$150 × 2 dias = R$300; 5 cadastros × R$10 = R$50;
 * diária R$100 + 5 × R$10 + bônus cumulativo meta 5 = R$200 → R$350. Tudo em centavos, calculado por SEMANA.
 */
import {
  CHAVES_NOVAS_PADRAO,
  calcularDia,
  calcularSemana,
  normalizarRegra,
  PRESET_CHEFE,
  PRESET_COMPLETO,
  REGRA_PADRAO,
  validarRegra,
  type EntradaDia,
  type RegraBruta,
  type VersaoRegra,
} from '../earnings-rules';

const SEG = '2026-10-19';
const dia = (d: string, over: Partial<EntradaDia> = {}): EntradaDia => ({
  dia: d,
  signups: 0,
  visits: 0,
  journey_open: false,
  elegivel: true,
  ...over,
});
const semana = (config: RegraBruta, entradas: EntradaDia[], hoje = '2026-10-25') => {
  const versoes: VersaoRegra[] = [{ version: 1, valid_from: '1970-01-01', config }];
  return calcularSemana({
    from: SEG,
    to: '2026-10-25',
    hoje,
    versoes,
    entradas: Object.fromEntries(entradas.map((e) => [e.dia, e])),
  });
};
const chefe = (over: Partial<RegraBruta> = {}): RegraBruta => ({ ...PRESET_CHEFE, ...over });

describe('normalizarRegra', () => {
  it('a v1 crua (13 chaves) ganha os padrões = comportamento atual, sem alterar a entrada', () => {
    const crua = { ...REGRA_PADRAO };
    const n = normalizarRegra(crua);
    expect(n).toMatchObject(CHAVES_NOVAS_PADRAO);
    expect(Object.keys(crua)).toHaveLength(13);
  });
  it('null vale como ausente', () => {
    expect(normalizarRegra({ ...REGRA_PADRAO, tiers_mode: null as never, signup_source: null as never }).tiers_mode).toBe('highest');
  });
});

describe('v1 crua x normalizada: valores, conta e chaves idêntica', () => {
  const entradas = [0, 9, 10, 12, 20].map((n) => dia(SEG, { signups: n, journey_open: true, visits: 3 }));
  it.each(entradas.map((e) => [e.signups, e] as const))('calcularDia com %i cadastros', (_n, e) => {
    expect(calcularDia(normalizarRegra(REGRA_PADRAO), e, 1)).toEqual(calcularDia(REGRA_PADRAO, e, 1));
    const r = calcularDia(REGRA_PADRAO, e, 1);
    expect(Object.keys(r)).not.toContain('diaria_cents');
    expect(r.conta.join(' ')).not.toMatch(/Diária|declarad|anulad/i);
  });
  it('calcularSemana, com piso e faixa semanal', () => {
    const base: RegraBruta = { ...REGRA_PADRAO, tiers_period: 'week', floor_cents: 5000, floor_condition: 'journey_open' };
    const es = [dia(SEG, { signups: 4, journey_open: true }), dia('2026-10-20', { signups: 8, journey_open: true })];
    expect(semana(normalizarRegra(base), es)).toEqual(semana(base, es));
  });
});

describe('validarRegra com as chaves novas', () => {
  it('a config de 13 campos continua válida e volta igual (nada é injetado)', () => {
    const r = validarRegra({ ...REGRA_PADRAO });
    expect(r.ok && r.regra).toEqual(REGRA_PADRAO);
  });
  it('chaves novas nulas (o web reenvia o que recebeu) valem como ausentes', () => {
    const nulas = Object.fromEntries(Object.keys(CHAVES_NOVAS_PADRAO).map((k) => [k, null]));
    const r = validarRegra({ ...REGRA_PADRAO, ...nulas });
    expect(r.ok && r.regra).toEqual(REGRA_PADRAO);
  });
  it('o eco da regra normalizada também é aceito', () => {
    expect(validarRegra(normalizarRegra(REGRA_PADRAO)).ok).toBe(true);
  });
  it('chave desconhecida continua erro; valores fora de faixa dizem o campo', () => {
    const ruins: Array<[string, unknown]> = [
      ['inventada', 1],
      ['signup_source', 'x'],
      ['daily_base_cents', 1.5],
      ['daily_base_cents', -1],
      ['daily_base_condition', 'sempre'],
      ['tiers_mode', 'todas'],
      ['declared_daily_cap', 0],
      ['declared_confirm_days', 14],
      ['daily_base_requires_journey', 'sim'],
    ];
    for (const [k, v] of ruins) {
      const r = validarRegra({ ...REGRA_PADRAO, [k]: v });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.campo).toBe(k);
    }
  });
  it('min_visits com diária exige ao menos 1 visita', () => {
    expect(validarRegra({ ...REGRA_PADRAO, daily_base_cents: 100, daily_base_condition: 'min_visits' }).ok).toBe(false);
    expect(validarRegra({ ...REGRA_PADRAO, daily_base_cents: 100, daily_base_condition: 'min_visits', daily_base_min_visits: 2 }).ok).toBe(true);
  });
  it('cumulativo aceita meta que paga menos que a anterior (é adicional); highest não', () => {
    const tiers = [{ min_signups: 5, amount_cents: 20000 }, { min_signups: 10, amount_cents: 10000 }];
    expect(validarRegra({ ...REGRA_PADRAO, tiers, tiers_mode: 'cumulative' }).ok).toBe(true);
    expect(validarRegra({ ...REGRA_PADRAO, tiers }).ok).toBe(false);
  });
});

describe('presets', () => {
  it('o completo é a regra atual com as chaves novas nos padrões', () => {
    expect(PRESET_COMPLETO).toEqual({ ...REGRA_PADRAO, ...CHAVES_NOVAS_PADRAO });
    expect(validarRegra(PRESET_COMPLETO).ok).toBe(true);
  });
  it('o do chefe é uma regra válida (valores em dinheiro zerados: a Lovable não tem padrão)', () => {
    expect(validarRegra(PRESET_CHEFE).ok).toBe(true);
    expect(PRESET_CHEFE).toMatchObject({ signup_source: 'declared', tiers_mode: 'cumulative', daily_base_condition: 'route_assigned', tiers_period: 'week', combine: 'sum', declared_daily_cap: 30 });
    expect(PRESET_CHEFE.unit_cents + PRESET_CHEFE.daily_base_cents + PRESET_CHEFE.tiers.length).toBe(0);
  });
});

describe('vetores do chefe (Lovable `financeiro.test.ts`), em centavos', () => {
  it('diária R$150 × 2 dias com rota da equipe = R$300', () => {
    const r = semana(chefe({ daily_base_cents: 15000, unit_cents: 1000 }), [
      dia(SEG, { route_assigned: true }),
      dia('2026-10-20', { route_assigned: true }),
    ]);
    expect(r.total_cents).toBe(30000);
    expect(r.days.filter((d) => d.diaria_cents === 15000)).toHaveLength(2);
  });
  it('5 cadastros × R$10 = R$50', () => {
    const r = semana(chefe({ unit_cents: 1000 }), [dia(SEG, { signups: 5 })]);
    expect(r.total_cents).toBe(5000);
    expect((r.days[0] as { conta: string[] }).conta.join(' ')).toContain('5 cadastros declarados × R$ 10,00 = R$ 50,00');
  });
  it('diária R$100 + 5 × R$10 + bônus cumulativo meta 5 = R$200 → R$350', () => {
    const r = semana(chefe({ daily_base_cents: 10000, unit_cents: 1000, tiers: [{ min_signups: 5, amount_cents: 20000 }] }), [
      dia(SEG, { signups: 5, route_assigned: true }),
    ]);
    expect(r.total_cents).toBe(35000);
    expect(r.days_cents).toBe(15000);
    expect(r.week_part_cents).toBe(20000);
  });
  it('bônus só quando bate a meta (4 cadastros = sem bônus)', () => {
    const cfg = chefe({ daily_base_cents: 10000, unit_cents: 1000, tiers: [{ min_signups: 5, amount_cents: 20000 }] });
    expect(semana(cfg, [dia(SEG, { signups: 4, route_assigned: true })]).total_cents).toBe(14000);
  });
  it('bônus cumulativo soma TODAS as metas atingidas; highest paga só a maior', () => {
    const tiers = [{ min_signups: 5, amount_cents: 20000 }, { min_signups: 10, amount_cents: 30000 }];
    const es = [dia(SEG, { signups: 6 }), dia('2026-10-20', { signups: 6 })];
    expect(semana(chefe({ tiers }), es).total_cents).toBe(50000);
    expect(semana({ ...chefe({ tiers }), tiers_mode: 'highest' }, es).total_cents).toBe(30000);
  });
  it('a mesma regra no modo por dia soma a diária e o núcleo igual', () => {
    const r = semana(chefe({ tiers_period: 'day', daily_base_cents: 10000, unit_cents: 1000, tiers: [{ min_signups: 5, amount_cents: 20000 }] }), [
      dia(SEG, { signups: 5, route_assigned: true }),
    ]);
    expect(r.total_cents).toBe(35000);
  });
});

describe('diária aditiva: condições, e fora do piso e do teto', () => {
  const base: RegraBruta = { ...REGRA_PADRAO, daily_base_cents: 8000 };
  it('sem rota da equipe a diária route_assigned não vale e a conta diz por quê', () => {
    const r = calcularDia({ ...base, daily_base_condition: 'route_assigned', daily_base_requires_journey: false }, dia(SEG), 1);
    expect(r.total_cents).toBe(0);
    expect(r.conta.join(' ')).toContain('Diária de R$ 80,00 não vale: não havia rota da equipe atribuída no dia');
  });
  it('por padrão a diária exige jornada iniciada', () => {
    expect(calcularDia(base, dia(SEG), 1).total_cents).toBe(0);
    expect(calcularDia(base, dia(SEG, { journey_open: true }), 1).total_cents).toBe(8000);
  });
  it('route_assigned + jornada exigida (configurável)', () => {
    const r = { ...base, daily_base_condition: 'route_assigned' as const, daily_base_requires_journey: true };
    expect(calcularDia(r, dia(SEG, { route_assigned: true }), 1).total_cents).toBe(0);
    expect(calcularDia(r, dia(SEG, { route_assigned: true, journey_open: true }), 1).total_cents).toBe(8000);
  });
  it('min_visits', () => {
    const r: RegraBruta = { ...base, daily_base_condition: 'min_visits', daily_base_min_visits: 3, daily_base_requires_journey: false };
    expect(calcularDia(r, dia(SEG, { visits: 2 }), 1).total_cents).toBe(0);
    expect(calcularDia(r, dia(SEG, { visits: 3 }), 1).total_cents).toBe(8000);
  });
  it('não é piso nem entra no teto: soma depois', () => {
    const r: RegraBruta = { ...base, daily_base_requires_journey: false, floor_cents: 5000, floor_condition: 'none', cap_cents: 12000 };
    // 12 cadastros: max(12000, faixa 10000) = 12000; teto 12000; + diária 8000
    const d = calcularDia(r, dia(SEG, { signups: 12 }), 1);
    expect(d.total_cents).toBe(20000);
    expect(d.diaria_cents).toBe(8000);
  });
});

describe('cadastro declarado: limite e anulação na conta', () => {
  it('as linhas da conta dizem acima do limite e anuladas', () => {
    const c = calcularDia(chefe({ unit_cents: 1000 }), dia(SEG, { signups: 30, declared_over_cap: 4, declared_voided: 2 }), 1).conta.join(' ');
    expect(c).toContain('Limite diário de 30 cadastros declarados: 4 declarações acima do limite não entram');
    expect(c).toContain('2 declarações anuladas no dia');
  });
});
