/**
 * Regra de pagamento por consultor (L13, contrato §45) — regras puras: resolução por dia (a do consultor OU a geral,
 * nunca as duas) e as conferências de uma versão nova do consultor.
 */
import { calcularSemana, REGRA_PADRAO, versaoVigente, type EntradaDia, type RegraBruta, type VersaoRegra } from '../earnings-rules';
import { CHAVES_CALENDARIO, rotuloRegraAplicada, validarRegraDoConsultor, versoesDoConsultor } from '../regra-consultor-rules';

const v = (version: number, valid_from: string, config: RegraBruta): VersaoRegra => ({ version, valid_from, config });
const GERAL = [v(1, '1970-01-01', REGRA_PADRAO), v(3, '2026-11-02', { ...REGRA_PADRAO, unit_cents: 1500 })];
const PROPRIA = { ...REGRA_PADRAO, unit_cents: 2000, tiers: [] };

describe('versoesDoConsultor (resolução por dia)', () => {
  it('sem regra própria devolve a MESMA lista geral (byte a byte)', () => {
    expect(versoesDoConsultor(GERAL, [])).toBe(GERAL);
  });
  it('antes da 1ª própria vale a geral; dali em diante só as do consultor (a geral nova não o alcança)', () => {
    const ef = versoesDoConsultor(GERAL, [v(2, '2026-10-21', PROPRIA)]);
    expect(versaoVigente(ef, '2026-10-20')?.version).toBe(1);
    expect(versaoVigente(ef, '2026-10-21')?.version).toBe(2);
    expect(versaoVigente(ef, '2026-11-10')?.version).toBe(2);
    const ef2 = versoesDoConsultor(GERAL, [v(2, '2026-10-21', PROPRIA), v(5, '2026-11-09', { ...PROPRIA, unit_cents: 2500 })]);
    expect(versaoVigente(ef2, '2026-11-08')?.version).toBe(2);
    expect(versaoVigente(ef2, '2026-11-09')?.version).toBe(5);
  });
  it('troca no meio da semana: cada dia pela sua versão, nunca somadas', () => {
    const ef = versoesDoConsultor([v(1, '1970-01-01', REGRA_PADRAO)], [v(2, '2026-10-21', PROPRIA)]);
    const e = (dia: string): EntradaDia => ({ dia, signups: 3, visits: 0, journey_open: true, elegivel: true });
    const entradas = { '2026-10-19': e('2026-10-19'), '2026-10-20': e('2026-10-20'), '2026-10-21': e('2026-10-21'), '2026-10-22': e('2026-10-22') };
    const s = calcularSemana({ from: '2026-10-19', to: '2026-10-25', hoje: '2026-10-26', versoes: ef, entradas });
    expect(s.days.map((d) => [d.rule_version, d.total_cents]).slice(0, 4)).toEqual([
      [1, 3000],
      [1, 3000],
      [2, 6000],
      [2, 6000],
    ]);
    expect(s.total_cents).toBe(18000);
  });
});

describe('rótulo da regra que valeu', () => {
  it('"Regra própria de Ana · versão 7" ou "Regra geral · versão 3"', () => {
    expect(rotuloRegraAplicada('consultant', 7, 'Ana')).toBe('Regra própria de Ana · versão 7');
    expect(rotuloRegraAplicada('global', 3, 'Ana')).toBe('Regra geral · versão 3');
  });
});

describe('validarRegraDoConsultor', () => {
  const base = {
    geral: [v(1, '1970-01-01', REGRA_PADRAO)],
    proprias: [] as VersaoRegra[],
    ultimaFechadaFim: '2026-10-18' as string | null,
    primeiraSemana: '2026-09-28',
  };
  it('semana aberta no passado é aceita (depois da última fechada)', () => {
    expect(validarRegraDoConsultor({ ...base, valid_from: '2026-10-19', nova: PROPRIA })).toBeNull();
    expect(validarRegraDoConsultor({ ...base, valid_from: '2026-10-21', nova: PROPRIA })).toBeNull();
  });
  it('dia de semana fechada (ou antes dela) = WEEK_CLOSED, com a semana na mensagem', () => {
    const e = validarRegraDoConsultor({ ...base, valid_from: '2026-10-18', nova: PROPRIA });
    expect(e).toMatchObject({ code: 'WEEK_CLOSED', campo: 'valid_from' });
    expect(e?.message).toContain('18/10');
    expect(validarRegraDoConsultor({ ...base, valid_from: '2026-01-01', nova: PROPRIA })).toMatchObject({ code: 'WEEK_CLOSED' });
  });
  it('sem semana fechada: não antes da 1ª semana do consultor', () => {
    expect(validarRegraDoConsultor({ ...base, ultimaFechadaFim: null, valid_from: '2026-09-27', nova: PROPRIA })).toMatchObject({ code: 'VALIDATION_ERROR', campo: 'valid_from' });
    expect(validarRegraDoConsultor({ ...base, ultimaFechadaFim: null, valid_from: '2026-09-28', nova: PROPRIA })).toBeNull();
  });
  it('o calendário tem de ser o da regra geral vigente no valid_from', () => {
    expect(CHAVES_CALENDARIO).toEqual(['week_start_weekday', 'payout_weekday', 'autoclose_hour', 'late_grace_days']);
    for (const k of CHAVES_CALENDARIO) {
      const nova = { ...PROPRIA, [k]: (REGRA_PADRAO[k] as number) === 6 ? 5 : (REGRA_PADRAO[k] as number) + 1 };
      expect(validarRegraDoConsultor({ ...base, valid_from: '2026-10-21', nova })).toMatchObject({ code: 'VALIDATION_ERROR', campo: k });
    }
  });
  it('alinhamento semanal e mensal contra a regra RESOLVIDA do consultor', () => {
    const semanal = { ...PROPRIA, tiers_period: 'week' as const, tiers: [{ min_signups: 10, amount_cents: 5000 }] };
    expect(validarRegraDoConsultor({ ...base, valid_from: '2026-10-21', nova: semanal })).toMatchObject({ campo: 'valid_from' });
    expect(validarRegraDoConsultor({ ...base, valid_from: '2026-10-19', nova: semanal })).toBeNull();
    // a própria vigente é semanal: a próxima também começa na segunda
    const proprias = [v(2, '2026-10-19', semanal)];
    expect(validarRegraDoConsultor({ ...base, proprias, valid_from: '2026-10-22', nova: PROPRIA })).toMatchObject({ campo: 'valid_from' });
    const mensal = { ...PROPRIA, tiers_period: 'month' as const, combine: 'sum' as const, tiers: [{ min_signups: 40, amount_cents: 30000 }] };
    expect(validarRegraDoConsultor({ ...base, valid_from: '2026-10-21', nova: mensal })).toMatchObject({ campo: 'valid_from' });
    expect(validarRegraDoConsultor({ ...base, valid_from: '2026-11-01', nova: mensal })).toBeNull();
  });
  it('data mal formada', () => {
    expect(validarRegraDoConsultor({ ...base, valid_from: '21/10/2026', nova: PROPRIA })).toMatchObject({ code: 'VALIDATION_ERROR', campo: 'valid_from' });
  });
});
