import {
  alvosDaSemana,
  brl,
  calcularDia,
  calcularSemana,
  dentroDoPrazoTardio,
  faixaAtingida,
  inicioDaSemana,
  lerRegraSalva,
  planejarLancamentos,
  proximoPagamento,
  REGRA_PADRAO,
  rotuloDia,
  semanaDePagamento,
  semanaDoDia,
  semanaEncerrada,
  validarRegra,
  validarVigencia,
  versaoVigente,
  type EntradaDia,
  type JaLancado,
  type RegraRemuneracao,
  type VersaoRegra,
} from '../earnings-rules';

const regra = (o: Partial<RegraRemuneracao> = {}): RegraRemuneracao => ({ ...REGRA_PADRAO, ...o });
const entrada = (signups: number, o: Partial<EntradaDia> = {}): EntradaDia => ({
  dia: '2026-10-20',
  signups,
  visits: 0,
  journey_open: false,
  elegivel: true,
  ...o,
});
const dia = (r: RegraRemuneracao, n: number, o: Partial<EntradaDia> = {}) =>
  calcularDia(r, entrada(n, o)).total_cents;
const v = (version: number, valid_from: string, o: Partial<RegraRemuneracao> = {}): VersaoRegra => ({
  version,
  valid_from,
  config: regra(o),
});

describe('brl', () => {
  it('formata centavos inteiros', () => {
    expect(brl(0)).toBe('R$ 0,00');
    expect(brl(5)).toBe('R$ 0,05');
    expect(brl(1000)).toBe('R$ 10,00');
    expect(brl(123456)).toBe('R$ 1.234,56');
    expect(brl(100000000)).toBe('R$ 1.000.000,00');
    expect(brl(-2500)).toBe('-R$ 25,00');
  });
});

describe('calcularDia — padrão inicial (R$ 10; 10→R$ 100; 20→R$ 250; max; sem piso)', () => {
  const r = regra();
  it.each([
    [0, 0],
    [1, 1000],
    [4, 4000],
    [9, 9000],
    [10, 10000],
    [12, 12000],
    [19, 19000],
    [20, 25000],
    [22, 25000],
    [25, 25000],
    [26, 26000],
    [30, 30000],
  ])('%i cadastros confirmados = %i centavos', (n, esperado) => {
    expect(dia(r, n)).toBe(esperado);
  });

  it('sem cadastro e sem piso: zero, com a conta escrita', () => {
    const d = calcularDia(r, entrada(0));
    expect(d.total_cents).toBe(0);
    expect(d.conta[0]).toBe('0 cadastros confirmados × R$ 10,00 = R$ 0,00.');
    expect(d.conta.at(-1)).toBe('Total do dia: R$ 0,00.');
    expect(d.proxima_faixa).toEqual({ min_signups: 10, amount_cents: 10000, faltam: 10 });
  });

  it('exatamente na faixa: mostra a faixa e que vale o maior', () => {
    const d = calcularDia(r, entrada(10));
    expect(d.faixa).toEqual({ min_signups: 10, amount_cents: 10000 });
    expect(d.conta).toContain('Faixa atingida: 10 cadastros = R$ 100,00.');
    expect(d.conta).toContain('Vale o maior: R$ 100,00.');
  });

  it('abaixo da faixa: diz quantos faltam e quanto paga', () => {
    const d = calcularDia(r, entrada(4));
    expect(d.conta).toContain('4 cadastros confirmados × R$ 10,00 = R$ 40,00.');
    expect(d.conta).toContain('Faltam 6 cadastros confirmados para a faixa de R$ 100,00 (10 cadastros).');
  });

  it('20 a 25 fecham R$ 250 e acima volta ao valor por cadastro', () => {
    expect([20, 21, 22, 23, 24, 25].map((n) => dia(r, n))).toEqual(Array(6).fill(25000));
    expect(dia(r, 26)).toBe(26000);
  });

  it('1 cadastro usa o singular', () => {
    expect(calcularDia(r, entrada(1)).conta[0]).toBe('1 cadastro confirmado × R$ 10,00 = R$ 10,00.');
  });
});

describe('calcularDia — modos de combinação', () => {
  it('sum: valor por cadastro + faixa', () => {
    const r = regra({ combine: 'sum' });
    expect(dia(r, 9)).toBe(9000);
    expect(dia(r, 10)).toBe(10000 + 10000);
    expect(dia(r, 20)).toBe(20000 + 25000);
    expect(calcularDia(r, entrada(10)).conta).toContain('Soma do valor por cadastro com a faixa: R$ 200,00.');
  });

  it('tier_only: só a faixa; abaixo da primeira vale zero', () => {
    const r = regra({ combine: 'tier_only' });
    expect(dia(r, 9)).toBe(0);
    expect(dia(r, 10)).toBe(10000);
    expect(dia(r, 19)).toBe(10000);
    expect(dia(r, 25)).toBe(25000);
    expect(calcularDia(r, entrada(9)).conta[0]).toContain('só vale a faixa');
  });

  it('sem faixas e unitário zero: nada a pagar', () => {
    expect(dia(regra({ tiers: [], unit_cents: 0 }), 50)).toBe(0);
  });

  it('valor por cadastro e faixas totalmente configuráveis', () => {
    const r = regra({ unit_cents: 2500, tiers: [{ min_signups: 3, amount_cents: 9000 }] });
    expect(dia(r, 2)).toBe(5000);
    expect(dia(r, 3)).toBe(9000);
    expect(dia(r, 4)).toBe(10000);
  });
});

describe('calcularDia — teto', () => {
  it('teto por dia limita o total', () => {
    const r = regra({ cap_cents: 20000 });
    expect(dia(r, 19)).toBe(19000);
    expect(dia(r, 20)).toBe(20000);
    const d = calcularDia(r, entrada(30));
    expect(d.teto_aplicado).toBe(true);
    expect(d.conta).toContain('Teto do dia de R$ 200,00 aplicado: o valor cai de R$ 300,00 para R$ 200,00.');
  });
  it('teto igual ao valor não conta como aplicado', () => {
    expect(calcularDia(regra({ cap_cents: 10000 }), entrada(10)).teto_aplicado).toBe(false);
  });
});

describe('calcularDia — piso por diária', () => {
  it('condição nenhuma: piso vale para consultor ativo, mesmo sem cadastro', () => {
    const r = regra({ floor_cents: 10000 });
    expect(dia(r, 0)).toBe(10000);
    expect(dia(r, 4)).toBe(10000);
    expect(dia(r, 12)).toBe(12000);
    expect(dia(r, 0, { elegivel: false })).toBe(0);
    expect(calcularDia(r, entrada(4)).conta).toContain(
      'Piso do dia de R$ 100,00 (dia de consultor ativo): sobe de R$ 40,00 para R$ 100,00.',
    );
  });

  it('piso já superado é dito e não é "aplicado"', () => {
    const d = calcularDia(regra({ floor_cents: 10000 }), entrada(12));
    expect(d.piso_aplicado).toBe(false);
    expect(d.conta).toContain('Piso do dia de R$ 100,00 (dia de consultor ativo) já foi superado.');
  });

  it('condição jornada aberta: sem jornada não há piso', () => {
    const r = regra({ floor_cents: 10000, floor_condition: 'journey_open' });
    expect(dia(r, 0, { journey_open: false })).toBe(0);
    expect(dia(r, 0, { journey_open: true })).toBe(10000);
    expect(calcularDia(r, entrada(0)).conta).toContain(
      'Piso do dia de R$ 100,00 não vale: não houve jornada iniciada no dia.',
    );
  });

  it('condição mínimo de visitas: exatamente no mínimo vale', () => {
    const r = regra({ floor_cents: 10000, floor_condition: 'min_visits', floor_min_visits: 10 });
    expect(dia(r, 0, { visits: 9 })).toBe(0);
    expect(dia(r, 0, { visits: 10 })).toBe(10000);
    expect(dia(r, 0, { visits: 30 })).toBe(10000);
    expect(calcularDia(r, entrada(0, { visits: 9 })).conta).toContain(
      'Piso do dia de R$ 100,00 não vale: foram 9 visitas e o mínimo é 10.',
    );
  });

  it('piso zero = sem piso', () => {
    expect(dia(regra({ floor_cents: 0, floor_condition: 'journey_open' }), 0, { journey_open: true })).toBe(
      0,
    );
  });

  it('piso + modo soma + teto, na ordem núcleo → piso → teto', () => {
    const r = regra({ combine: 'sum', floor_cents: 30000, cap_cents: 40000 });
    expect(dia(r, 5)).toBe(30000);
    expect(dia(r, 10)).toBe(30000);
    expect(dia(r, 20)).toBe(40000);
  });
});

describe('calcularDia — faixa semanal não age no dia', () => {
  it('no dia só vale o valor por cadastro e o piso', () => {
    const r = regra({ tiers_period: 'week' });
    expect(dia(r, 25)).toBe(25000);
    expect(calcularDia(r, entrada(25)).faixa).toBeNull();
  });
});

describe('versaoVigente', () => {
  const vs = [v(1, '1970-01-01'), v(2, '2026-10-26'), v(3, '2026-10-26'), v(4, '2026-11-02')];
  it('maior valid_from ≤ dia; empate pela maior versão', () => {
    expect(versaoVigente(vs, '2026-10-25')?.version).toBe(1);
    expect(versaoVigente(vs, '2026-10-26')?.version).toBe(3);
    expect(versaoVigente(vs, '2026-11-01')?.version).toBe(3);
    expect(versaoVigente(vs, '2026-11-02')?.version).toBe(4);
  });
  it('nenhuma começou → null', () => {
    expect(versaoVigente([v(1, '2026-10-26')], '2026-10-25')).toBeNull();
  });
});

describe('semana de Brasília', () => {
  it('segunda a domingo por padrão; virada de dia/semana', () => {
    expect(semanaDoDia('2026-10-19', 1)).toEqual({ from: '2026-10-19', to: '2026-10-25' });
    expect(semanaDoDia('2026-10-25', 1)).toEqual({ from: '2026-10-19', to: '2026-10-25' });
    expect(semanaDoDia('2026-10-26', 1)).toEqual({ from: '2026-10-26', to: '2026-11-01' });
  });
  it('início da semana configurável (domingo e quarta)', () => {
    expect(inicioDaSemana('2026-10-20', 0)).toBe('2026-10-18');
    expect(inicioDaSemana('2026-10-20', 3)).toBe('2026-10-14');
    expect(semanaDoDia('2026-10-21', 3)).toEqual({ from: '2026-10-21', to: '2026-10-27' });
  });
  it('rótulos', () => {
    expect(rotuloDia('2026-10-26')).toBe('seg 26/10');
  });
  it('próximo Pix: primeiro dia do pagamento depois do fim da semana', () => {
    expect(proximoPagamento('2026-10-25', 1)).toBe('2026-10-26');
    expect(proximoPagamento('2026-10-25', 5)).toBe('2026-10-30');
    expect(proximoPagamento('2026-10-25', 0)).toBe('2026-11-01');
  });
  it('encerrada só depois do último dia; prazo da confirmação tardia', () => {
    expect(semanaEncerrada('2026-10-25', '2026-10-25')).toBe(false);
    expect(semanaEncerrada('2026-10-25', '2026-10-26')).toBe(true);
    expect(dentroDoPrazoTardio('2026-10-25', '2026-11-08', 14)).toBe(true);
    expect(dentroDoPrazoTardio('2026-10-25', '2026-11-09', 14)).toBe(false);
    expect(dentroDoPrazoTardio('2026-10-25', '2026-10-26', 0)).toBe(false);
  });
});

describe('calcularSemana', () => {
  const SEG = '2026-10-19';
  const DOM = '2026-10-25';
  const entradas = (n: Record<string, number>, extra: Partial<EntradaDia> = {}) =>
    Object.fromEntries(Object.entries(n).map(([d, s]) => [d, entrada(s, { dia: d, ...extra })]));

  it('faixa por dia: soma dos dias; dias futuros valem zero', () => {
    const s = calcularSemana({
      from: SEG,
      to: DOM,
      hoje: '2026-10-21',
      versoes: [v(1, '1970-01-01')],
      entradas: entradas({ '2026-10-19': 4, '2026-10-20': 20, '2026-10-21': 10, '2026-10-22': 99 }),
    });
    expect(s.days.map((d) => d.total_cents)).toEqual([4000, 25000, 10000, 0, 0, 0, 0]);
    expect(s.days_cents).toBe(39000);
    expect(s.week_part_cents).toBe(0);
    expect(s.total_cents).toBe(39000);
    expect(s.days[3]!.futuro).toBe(true);
    expect(s.conta).toContain('seg 19/10: R$ 40,00 (4 cadastros confirmados).');
    expect(s.conta.at(-1)).toBe('Total da semana: R$ 390,00.');
  });

  it('semana sem nada: zero', () => {
    const s = calcularSemana({ from: SEG, to: DOM, hoje: DOM, versoes: [v(1, '1970-01-01')], entradas: {} });
    expect(s.total_cents).toBe(0);
  });

  it('mudança de regra no meio da semana: cada dia com a sua versão', () => {
    const vs = [v(1, '1970-01-01'), v(2, '2026-10-22', { unit_cents: 2000, tiers: [] })];
    const s = calcularSemana({
      from: SEG,
      to: DOM,
      hoje: DOM,
      versoes: vs,
      entradas: entradas({ '2026-10-21': 10, '2026-10-22': 10 }),
    });
    expect(s.days[2]!.total_cents).toBe(10000); // qua: versão 1, faixa
    expect(s.days[2]!.rule_version).toBe(1);
    expect(s.days[3]!.total_cents).toBe(20000); // qui: versão 2, 10 × R$ 20
    expect(s.days[3]!.rule_version).toBe(2);
  });

  it('virada de dia: cadastros do domingo e da segunda ficam em semanas diferentes', () => {
    const vs = [v(1, '1970-01-01')];
    const a = calcularSemana({
      from: SEG,
      to: DOM,
      hoje: '2026-10-26',
      versoes: vs,
      entradas: entradas({ '2026-10-25': 3 }),
    });
    const b = calcularSemana({
      from: '2026-10-26',
      to: '2026-11-01',
      hoje: '2026-10-26',
      versoes: vs,
      entradas: entradas({ '2026-10-26': 2 }),
    });
    expect(a.total_cents).toBe(3000);
    expect(b.total_cents).toBe(2000);
  });

  describe('faixa semanal', () => {
    const sem = (o: Partial<RegraRemuneracao> = {}) => [
      v(1, '1970-01-01', { tiers_period: 'week', tiers: [{ min_signups: 20, amount_cents: 25000 }], ...o }),
    ];
    it('max: vale o maior entre a soma dos dias e a faixa; parte semanal = diferença', () => {
      const s = calcularSemana({
        from: SEG,
        to: DOM,
        hoje: DOM,
        versoes: sem(),
        entradas: entradas({ '2026-10-19': 8, '2026-10-20': 7, '2026-10-21': 5 }),
      });
      expect(s.signups_week).toBe(20);
      expect(s.days_cents).toBe(20000);
      expect(s.total_cents).toBe(25000);
      expect(s.week_part_cents).toBe(5000);
      expect(s.conta).toContain(
        'Faixa semanal atingida: 20 cadastros na semana = R$ 250,00 (a semana teve 20 cadastros confirmados).',
      );
    });
    it('abaixo da faixa semanal: só os dias, diz quantos faltam', () => {
      const s = calcularSemana({
        from: SEG,
        to: DOM,
        hoje: DOM,
        versoes: sem(),
        entradas: entradas({ '2026-10-19': 19 }),
      });
      expect(s.total_cents).toBe(19000);
      expect(s.week_part_cents).toBe(0);
      expect(s.conta).toContain('Faltam 1 cadastro confirmado na semana para a faixa semanal de R$ 250,00.');
    });
    it('soma: dias + faixa', () => {
      const s = calcularSemana({
        from: SEG,
        to: DOM,
        hoje: DOM,
        versoes: sem({ combine: 'sum' }),
        entradas: entradas({ '2026-10-19': 20 }),
      });
      expect(s.total_cents).toBe(20000 + 25000);
    });
    it('tier_only: só faixa semanal (unitário ignorado)', () => {
      const s = calcularSemana({
        from: SEG,
        to: DOM,
        hoje: DOM,
        versoes: sem({ combine: 'tier_only' }),
        entradas: entradas({ '2026-10-19': 20 }),
      });
      expect(s.days_cents).toBe(0);
      expect(s.total_cents).toBe(25000);
      const p = calcularSemana({
        from: SEG,
        to: DOM,
        hoje: DOM,
        versoes: sem({ combine: 'tier_only' }),
        entradas: entradas({ '2026-10-19': 19 }),
      });
      expect(p.total_cents).toBe(0);
    });
    it('teto semanal limita (parte semanal pode ser negativa)', () => {
      const s = calcularSemana({
        from: SEG,
        to: DOM,
        hoje: DOM,
        versoes: sem({ cap_cents: 15000 }),
        entradas: entradas({ '2026-10-19': 30 }),
      });
      expect(s.days_cents).toBe(30000);
      expect(s.total_cents).toBe(15000);
      expect(s.week_part_cents).toBe(-15000);
      expect(s.conta).toContain('Teto da semana de R$ 150,00 aplicado.');
    });
    it('piso diário continua valendo dentro da semana', () => {
      const s = calcularSemana({
        from: SEG,
        to: DOM,
        hoje: '2026-10-20',
        versoes: sem({ floor_cents: 5000, floor_condition: 'journey_open' }),
        entradas: entradas({ '2026-10-19': 1, '2026-10-20': 0 }, { journey_open: true }),
      });
      expect(s.days_cents).toBe(10000);
    });
    it('parâmetros semanais seguem a versão vigente no primeiro dia da semana', () => {
      const vs = [
        v(1, '1970-01-01', { tiers_period: 'week', tiers: [{ min_signups: 5, amount_cents: 9000 }] }),
        v(2, '2026-10-22', { tiers_period: 'week', tiers: [{ min_signups: 5, amount_cents: 99999 }] }),
      ];
      const s = calcularSemana({
        from: SEG,
        to: DOM,
        hoje: DOM,
        versoes: vs,
        entradas: entradas({ '2026-10-19': 5 }),
      });
      expect(s.total_cents).toBe(9000);
      expect(s.rule_version).toBe(1);
    });
  });

  it('sem nenhuma versão vigente é erro explícito (nunca paga com palpite)', () => {
    expect(() =>
      calcularSemana({ from: SEG, to: DOM, hoje: DOM, versoes: [v(1, '2027-01-01')], entradas: {} }),
    ).toThrow(/Nenhuma versão/);
  });
});

describe('razão: alvos e deltas', () => {
  const SEG = '2026-10-19';
  const sem = (n: Record<string, number>, extra: Partial<RegraRemuneracao> = {}) =>
    calcularSemana({
      from: SEG,
      to: '2026-10-25',
      hoje: '2026-10-25',
      versoes: [v(1, '1970-01-01', extra)],
      entradas: Object.fromEntries(Object.entries(n).map(([d, s]) => [d, entrada(s, { dia: d })])),
    });
  const lancado = (e: Record<string, JaLancado>) => new Map(Object.entries(e));

  it('um alvo por dia + a parte semanal', () => {
    const alvos = alvosDaSemana(sem({ '2026-10-19': 4 }));
    expect(alvos).toHaveLength(8);
    expect(alvos[0]).toMatchObject({
      scope: 'day',
      work_day: '2026-10-19',
      work_week: SEG,
      cents: 4000,
      rule_version: 1,
    });
    expect(alvos[7]).toMatchObject({ scope: 'week', work_day: null, cents: 0 });
  });

  it('primeiro lançamento: delta = alvo; chave n=1; delta zero não grava', () => {
    const d = planejarLancamentos(alvosDaSemana(sem({ '2026-10-19': 4 })), lancado({}));
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ delta_cents: 4000, idempotency_key: 'acc:day:2026-10-19:1' });
  });

  it('já lançado tudo: nenhum delta (idempotente)', () => {
    const d = planejarLancamentos(
      alvosDaSemana(sem({ '2026-10-19': 4 })),
      lancado({ 'day:2026-10-19': { soma: 4000, qtd: 1 } }),
    );
    expect(d).toEqual([]);
  });

  it('confirmação tardia: delta positivo com a próxima chave da sequência', () => {
    const d = planejarLancamentos(
      alvosDaSemana(sem({ '2026-10-19': 10 })),
      lancado({ 'day:2026-10-19': { soma: 4000, qtd: 1 } }),
    );
    expect(d[0]).toMatchObject({ delta_cents: 6000, idempotency_key: 'acc:day:2026-10-19:2' });
  });

  it('valor que sobe e volta ao mesmo número não repete a chave (sequência, não valor)', () => {
    const a = planejarLancamentos(
      alvosDaSemana(sem({ '2026-10-19': 10 })),
      lancado({ 'day:2026-10-19': { soma: 12000, qtd: 2 } }),
    );
    expect(a[0]).toMatchObject({ delta_cents: -2000, idempotency_key: 'acc:day:2026-10-19:3' });
  });

  it('parte semanal vira lançamento próprio, delta pode ser negativo', () => {
    const s = sem(
      { '2026-10-19': 30 },
      { tiers_period: 'week', tiers: [{ min_signups: 20, amount_cents: 25000 }], cap_cents: 15000 },
    );
    const d = planejarLancamentos(alvosDaSemana(s), lancado({ 'day:2026-10-19': { soma: 30000, qtd: 1 } }));
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({
      scope: 'week',
      work_day: null,
      delta_cents: -15000,
      idempotency_key: `acc:week:${SEG}:1`,
    });
  });

  it('semana fechada nunca reabre: o delta vai para a primeira semana aberta depois dela', () => {
    const fechadas = new Set(['2026-10-12']);
    expect(semanaDePagamento('2026-10-12', fechadas)).toBe(SEG);
    expect(semanaDePagamento(SEG, fechadas)).toBe(SEG);
    expect(semanaDePagamento('2026-10-05', fechadas)).toBe('2026-10-05');
    // duas fechadas seguidas: pula as duas
    expect(semanaDePagamento('2026-10-05', new Set(['2026-10-05', '2026-10-12']))).toBe(SEG);
  });
});

describe('validarRegra (estrita)', () => {
  const ok = (o: Record<string, unknown> = {}) => validarRegra({ ...REGRA_PADRAO, ...o });
  const campo = (o: Record<string, unknown>) => {
    const r = ok(o);
    return r.ok ? null : r.campo;
  };

  it('o padrão é válido e a regra volta igual', () => {
    const r = validarRegra(REGRA_PADRAO);
    expect(r).toEqual({ ok: true, regra: REGRA_PADRAO });
    expect(lerRegraSalva(REGRA_PADRAO)).toEqual(REGRA_PADRAO);
  });
  it('rejeita campo desconhecido, ausente, tipo errado e float em dinheiro', () => {
    expect(campo({ bonus: 1 })).toBe('bonus');
    const { unit_cents: _u, ...sem } = REGRA_PADRAO;
    expect(validarRegra(sem)).toMatchObject({ ok: false, campo: 'unit_cents' });
    expect(campo({ unit_cents: 10.5 })).toBe('unit_cents');
    expect(campo({ unit_cents: '1000' })).toBe('unit_cents');
    expect(campo({ unit_cents: -1 })).toBe('unit_cents');
    expect(campo({ unit_cents: 1_000_001 })).toBe('unit_cents');
    expect(campo({ cap_cents: 99.9 })).toBe('cap_cents');
    expect(campo({ floor_cents: 0.5 })).toBe('floor_cents');
    expect(validarRegra(null)).toMatchObject({ ok: false });
    expect(validarRegra([])).toMatchObject({ ok: false });
  });
  it('enums e dias da semana', () => {
    expect(campo({ tiers_period: 'month' })).toBe('tiers_period');
    expect(campo({ combine: 'min' })).toBe('combine');
    expect(campo({ floor_condition: 'always' })).toBe('floor_condition');
    expect(campo({ visits_count: 'x' })).toBe('visits_count');
    expect(campo({ week_start_weekday: 7 })).toBe('week_start_weekday');
    expect(campo({ payout_weekday: -1 })).toBe('payout_weekday');
    expect(campo({ autoclose_hour: 24 })).toBe('autoclose_hour');
    expect(campo({ late_grace_days: 93 })).toBe('late_grace_days');
  });
  it('faixas: crescentes, valores não decrescentes, no máximo 10, tier_only exige faixa', () => {
    expect(
      campo({
        tiers: [
          { min_signups: 10, amount_cents: 100 },
          { min_signups: 10, amount_cents: 200 },
        ],
      }),
    ).toBe('tiers');
    expect(
      campo({
        tiers: [
          { min_signups: 10, amount_cents: 300 },
          { min_signups: 20, amount_cents: 200 },
        ],
      }),
    ).toBe('tiers');
    expect(campo({ tiers: [{ min_signups: 0, amount_cents: 100 }] })).toBe('tiers');
    expect(campo({ tiers: [{ min_signups: 1, amount_cents: 1.5 }] })).toBe('tiers');
    expect(campo({ tiers: [{ min_signups: 1, amount_cents: 100, extra: 1 }] })).toBe('tiers');
    expect(
      campo({ tiers: Array.from({ length: 11 }, (_, i) => ({ min_signups: i + 1, amount_cents: 100 })) }),
    ).toBe('tiers');
    expect(campo({ tiers: 'x' })).toBe('tiers');
    expect(campo({ combine: 'tier_only', tiers: [] })).toBe('tiers');
    expect(ok({ tiers: [] }).ok).toBe(true);
  });
  it('piso: min_visits exige o mínimo; teto não pode ficar abaixo do piso', () => {
    expect(campo({ floor_cents: 10000, floor_condition: 'min_visits', floor_min_visits: 0 })).toBe(
      'floor_min_visits',
    );
    expect(ok({ floor_cents: 10000, floor_condition: 'min_visits', floor_min_visits: 10 }).ok).toBe(true);
    expect(campo({ floor_cents: 10000, cap_cents: 9000 })).toBe('cap_cents');
    expect(ok({ floor_cents: 10000, cap_cents: 10000 }).ok).toBe(true);
  });
  it('lerRegraSalva falha alto com JSON corrompido', () => {
    expect(() => lerRegraSalva({ unit_cents: 1 })).toThrow(/inválida/);
  });
  it('faixaAtingida pega a maior atingida', () => {
    expect(faixaAtingida(REGRA_PADRAO.tiers, 25)?.min_signups).toBe(20);
    expect(faixaAtingida(REGRA_PADRAO.tiers, 9)).toBeNull();
  });
});

describe('validarVigencia', () => {
  const base = { hoje: '2026-10-20', versoes: [v(1, '1970-01-01')], semanaTravada: false };
  it('não aceita data inválida nem passado', () => {
    expect(validarVigencia({ ...base, valid_from: '2026-02-31', nova: regra() })?.campo).toBe('valid_from');
    expect(validarVigencia({ ...base, valid_from: '2026-10-19', nova: regra() })?.message).toContain(
      'de hoje em diante',
    );
  });
  it('hoje e futuro valem', () => {
    expect(validarVigencia({ ...base, valid_from: '2026-10-20', nova: regra() })).toBeNull();
    expect(validarVigencia({ ...base, valid_from: '2026-10-22', nova: regra() })).toBeNull();
  });
  it('faixa semanal só começa no primeiro dia da semana', () => {
    expect(
      validarVigencia({ ...base, valid_from: '2026-10-22', nova: regra({ tiers_period: 'week' }) })?.campo,
    ).toBe('valid_from');
    expect(
      validarVigencia({ ...base, valid_from: '2026-10-26', nova: regra({ tiers_period: 'week' }) }),
    ).toBeNull();
  });
  it('sair de faixa semanal no meio da semana também é barrado', () => {
    const versoes = [v(1, '1970-01-01', { tiers_period: 'week' })];
    expect(
      validarVigencia({ ...base, versoes, valid_from: '2026-10-22', nova: regra({ tiers_period: 'day' }) })
        ?.campo,
    ).toBe('valid_from');
  });
  it('início da semana trava depois que há razão', () => {
    const e = validarVigencia({
      ...base,
      semanaTravada: true,
      valid_from: '2026-10-26',
      nova: regra({ week_start_weekday: 0 }),
    });
    expect(e?.code).toBe('WEEK_START_LOCKED');
    expect(
      validarVigencia({
        ...base,
        semanaTravada: false,
        valid_from: '2026-10-25',
        nova: regra({ week_start_weekday: 0 }),
      }),
    ).toBeNull();
    expect(
      validarVigencia({
        ...base,
        semanaTravada: true,
        valid_from: '2026-10-22',
        nova: regra({ unit_cents: 1 }),
      }),
    ).toBeNull();
  });
});
