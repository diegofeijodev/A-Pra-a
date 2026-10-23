import {
  codigoDoCupom,
  CONFIG_VOUCHER,
  corpoDoCupom,
  cupomConfere,
  desfechoDaFalha,
  devidoAgora,
  esperaMin,
  expiraEm,
  horaDeLer,
  lerParamsCupom,
  mensagemDoLimite,
  mudancaDoSync,
  paramsDoCupom,
  resumoDoCupom,
  situacaoDo,
  type CupomFreela,
} from '../voucher-rules';

const ID = '7b3e9c1a-4d2f-4e8b-9a6c-1f0e2d3c4b5a';
const PADRAO = paramsDoCupom(CONFIG_VOUCHER.padrao);

describe('código do cupom', () => {
  it('PRACA- + 10 base32 maiúsculos, sempre o mesmo para o mesmo pedido', () => {
    expect(codigoDoCupom(ID)).toBe('PRACA-PM7JYGSNF5');
    expect(codigoDoCupom(ID.toUpperCase())).toBe('PRACA-PM7JYGSNF5');
    expect(codigoDoCupom('00000000-0000-4000-8000-000000000001')).toMatch(/^PRACA-[A-Z2-7]{10}$/);
    expect(codigoDoCupom(ID).length).toBeLessThanOrEqual(40);
    expect(() => codigoDoCupom('x')).toThrow();
  });
});

describe('configuração e parâmetros (§38.2)', () => {
  it('padrão: PERCENT 100, uso único, 30 dias, sem jornada mínima, 1 por empresa, motivo obrigatório', () => {
    expect(CONFIG_VOUCHER.padrao).toEqual({
      max_por_empresa: 1,
      discount_type: 'PERCENT',
      percent_off: 100,
      amount_off_cents: null,
      single_use: true,
      validade_dias: 30,
      min_job_hours: null,
      motivo_reprovacao: 'obrigatorio',
      voucher_sync_min: 30,
    });
    expect(resumoDoCupom(PADRAO)).toBe('100% de desconto · vale 1 vez · 30 dias');
  });

  it('PERCENT exige percent_off; FIXED exige amount_off_cents; null é valor nas anuláveis', () => {
    const c = CONFIG_VOUCHER.padrao;
    expect(CONFIG_VOUCHER.aplicar(c, { percent_off: null })).toMatchObject({ ok: false });
    expect(CONFIG_VOUCHER.aplicar(c, { discount_type: 'FIXED' })).toMatchObject({ ok: false });
    const fixo = CONFIG_VOUCHER.aplicar(c, {
      discount_type: 'FIXED',
      amount_off_cents: 5000,
      validade_dias: null,
    });
    expect(fixo.ok).toBe(true);
    if (fixo.ok) {
      expect(paramsDoCupom(fixo.config)).toMatchObject({
        discount_type: 'FIXED',
        percent_off: null,
        amount_off_cents: 5000,
        validade_dias: null,
      });
      expect(resumoDoCupom(paramsDoCupom(fixo.config))).toBe('R$ 50,00 de desconto · vale 1 vez · sem prazo');
    }
    expect(CONFIG_VOUCHER.aplicar(c, { max_por_empresa: 0 })).toMatchObject({ ok: false });
    expect(CONFIG_VOUCHER.aplicar(c, { coisa: 1 })).toMatchObject({ ok: false });
    expect(CONFIG_VOUCHER.ler({ max_por_empresa: 'x', percent_off: 50 })).toMatchObject({
      max_por_empresa: 1,
      percent_off: 50,
    });
  });

  it('lê a foto dos parâmetros', () => {
    expect(lerParamsCupom(PADRAO)).toEqual(PADRAO);
    expect(lerParamsCupom(null)).toBeNull();
    expect(lerParamsCupom({ discount_type: 'X' })).toBeNull();
  });
});

describe('corpo do Freela', () => {
  it('PERCENT 100, uso único, validade 23:59:59 de Brasília do dia + 30', () => {
    expect(corpoDoCupom(PADRAO, 'PRACA-AAA', 'user-1', '2026-10-22')).toEqual({
      code: 'PRACA-AAA',
      discountType: 'PERCENT',
      percentOff: 100,
      contractorUserId: 'user-1',
      singleUse: true,
      expiresAt: '2026-11-22T02:59:59.000Z',
    });
    expect(expiraEm('2026-12-31', 1)).toBe('2027-01-02T02:59:59.000Z');
  });
  it('FIXED não manda percentOff; sem validade não manda expiresAt; jornada mínima vai', () => {
    const p = {
      ...PADRAO,
      discount_type: 'FIXED' as const,
      percent_off: null,
      amount_off_cents: 3000,
      validade_dias: null,
      min_job_hours: 6,
    };
    const c = corpoDoCupom(p, 'PRACA-B', 'u', '2026-10-22');
    expect(c).toEqual({
      code: 'PRACA-B',
      discountType: 'FIXED',
      amountOffInCents: 3000,
      contractorUserId: 'u',
      singleUse: true,
      minJobHours: 6,
    });
  });
});

describe('adoção', () => {
  const cupom = (o: Partial<CupomFreela> = {}): CupomFreela => ({
    id: 'c1',
    code: 'PRACA-AAA',
    discountType: 'PERCENT',
    percentOff: 100,
    amountOffInCents: null,
    contractorUserId: 'u1',
    singleUse: true,
    active: true,
    expiresAt: null,
    redeemedAt: null,
    ...o,
  });
  const esperado = { code: 'praca-aaa', contractorUserId: 'u1', params: PADRAO };
  it('mesmo código, contratante e desconto = adota', () =>
    expect(cupomConfere(cupom(), esperado)).toBe(true));
  it('outro contratante ou outro desconto = não', () => {
    expect(cupomConfere(cupom({ contractorUserId: 'u2' }), esperado)).toBe(false);
    expect(cupomConfere(cupom({ percentOff: 50 }), esperado)).toBe(false);
    expect(cupomConfere(cupom({ discountType: 'FIXED', amountOffInCents: 100 }), esperado)).toBe(false);
    expect(cupomConfere(cupom({ code: 'PRACA-BBB' }), esperado)).toBe(false);
  });
});

describe('falhas do Freela', () => {
  it.each([
    [{ freelaStatus: 400, freelaCode: 'COUPON_CODE_TAKEN' }, 'reler', 'COUPON_CODE_TAKEN'],
    [{ freelaStatus: 502 }, 'reler', 'FREELA_5XX'],
    [{ code: 'FREELA_UNREACHABLE' }, 'reler', 'FREELA_UNREACHABLE'],
    [{ code: 'FREELA_ERROR' }, 'reler', 'FREELA_ERROR'],
    [{ freelaStatus: 401 }, 'transitorio', 'FREELA_AUTH'],
    [{ freelaStatus: 429 }, 'transitorio', 'FREELA_BUSY'],
    [{ code: 'FREELA_NOT_CONFIGURED' }, 'transitorio', 'FREELA_NOT_CONFIGURED'],
    [{ freelaStatus: 400, freelaCode: 'COUPON_INVALID_PERCENT' }, 'rejeitado', 'FREELA_REJECTED'],
    [{}, 'transitorio', 'FREELA_UNKNOWN'],
  ])('%j → %s %s', (e, tipo, code) => {
    expect(desfechoDaFalha(e)).toEqual({ tipo, code });
  });

  it('espera crescente 2, 4, 8, 16, 32 e depois 60 min, contada da última tentativa', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 20].map(esperaMin)).toEqual([2, 4, 8, 16, 32, 60, 60, 60]);
    const t = new Date('2026-10-22T12:00:00Z');
    expect(devidoAgora({ coupon_attempts: 0, coupon_last_attempt_at: null }, t)).toBe(true);
    expect(
      devidoAgora({ coupon_attempts: 3, coupon_last_attempt_at: new Date(t.getTime() - 7 * 60_000) }, t),
    ).toBe(false);
    expect(
      devidoAgora({ coupon_attempts: 3, coupon_last_attempt_at: new Date(t.getTime() - 8 * 60_000) }, t),
    ).toBe(true);
  });
});

describe('leitura do estado (§38.7)', () => {
  const agora = new Date('2026-10-22T12:00:00Z');
  const c = (o: Partial<CupomFreela>): CupomFreela => ({
    id: 'c1',
    code: 'PRACA-AAA',
    discountType: 'PERCENT',
    percentOff: 100,
    amountOffInCents: null,
    contractorUserId: 'u1',
    singleUse: true,
    active: true,
    expiresAt: null,
    redeemedAt: null,
    ...o,
  });
  it('usado, devolvido, vencido, desativado; nada muda = null', () => {
    expect(mudancaDoSync('criado', c({ redeemedAt: '2026-10-21T15:00:00.000Z' }), agora)).toEqual({
      para: 'usado',
      evento: 'coupon_redeemed',
      redeemed_at: new Date('2026-10-21T15:00:00.000Z'),
    });
    expect(mudancaDoSync('usado', c({}), agora)).toEqual({
      para: 'criado',
      evento: 'coupon_unredeemed',
      redeemed_at: null,
    });
    expect(mudancaDoSync('criado', c({ expiresAt: '2026-10-21T00:00:00.000Z' }), agora)).toEqual({
      para: 'vencido',
      evento: 'coupon_expired',
    });
    expect(
      mudancaDoSync('usado', c({ active: false, redeemedAt: '2026-10-21T15:00:00.000Z' }), agora),
    ).toEqual({ para: 'desativado', evento: 'coupon_deactivated' });
    expect(mudancaDoSync('criado', c({}), agora)).toBeNull();
    expect(
      mudancaDoSync(
        'usado',
        c({ redeemedAt: '2026-10-21T15:00:00.000Z', expiresAt: '2026-10-01T00:00:00.000Z' }),
        agora,
      ),
    ).toBeNull();
    expect(mudancaDoSync('vencido', c({ active: false }), agora)).toBeNull();
  });
  it('lê a cada voucher_sync_min', () => {
    expect(horaDeLer(null, agora, 30)).toBe(true);
    expect(horaDeLer(new Date(agora.getTime() - 29 * 60_000), agora, 30)).toBe(false);
    expect(horaDeLer(new Date(agora.getTime() - 30 * 60_000), agora, 30)).toBe(true);
  });
});

describe('situação e textos', () => {
  it.each([
    ['pendente', null, 'pedido'],
    ['reprovado', null, 'reprovado'],
    ['aprovado', 'nao_aplicavel', 'registrado'],
    ['aprovado', 'aguardando_vinculo', 'aguardando_empresa'],
    ['aprovado', 'aguardando_freela', 'aguardando_freela'],
    ['aprovado', 'criado', 'criado'],
    ['aprovado', 'erro', 'erro'],
  ])('%s/%s → %s', (status, coupon_status, s) => {
    expect(situacaoDo({ status, coupon_status })).toBe(s);
  });
  it('limite: diz quem pediu e quando (dia de Brasília)', () => {
    expect(
      mensagemDoLimite({
        consultant_name: 'Ana',
        created_at: new Date('2026-10-21T02:30:00Z'),
        status: 'pendente',
      }),
    ).toBe('Esta empresa já tem um cupom pedido, por Ana em 20/10.');
  });
});
