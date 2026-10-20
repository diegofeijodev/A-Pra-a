import {
  BOM,
  celulaTexto,
  chavePixUtilizavel,
  LIMITE_COMPROVANTE_BYTES,
  linhasDeEstorno,
  linhasDePagamento,
  mascararPix,
  montarCsv,
  reaisCsv,
  resumirFila,
  saldoDaSemana,
  textoDoConsultor,
  tipoDoComprovante,
  transicao,
  validarComprovante,
  validarValorPago,
  type LinhaCsv,
  type LinhaRazao,
} from '../payout-rules';

const SEMANA = { from: '2026-10-19', to: '2026-10-25' };
const CPF = '52998224725';

describe('transições do pagamento', () => {
  it('segue a tabela do contrato §29.3', () => {
    expect(transicao('pending', 'pay', false)).toMatchObject({ ok: true, para: 'paid', evento: 'paid' });
    expect(transicao('pending', 'fail', false)).toMatchObject({ ok: true, para: 'failed' });
    expect(transicao('failed', 'retry', false)).toMatchObject({ ok: true, para: 'pending', evento: 'retried' });
    expect(transicao('failed', 'pay', false)).toMatchObject({ ok: true, para: 'paid' });
    expect(transicao('paid', 'reverse', false)).toMatchObject({ ok: true, para: 'cancelled', evento: 'reversed' });
    expect(transicao('pending', 'cancel', false)).toMatchObject({ ok: true, para: 'cancelled' });
  });

  it.each([
    ['paid', 'pay'],
    ['paid', 'fail'],
    ['paid', 'cancel'],
    ['paid', 'retry'],
    ['cancelled', 'pay'],
    ['cancelled', 'retry'],
    ['cancelled', 'reverse'],
    ['pending', 'retry'],
    ['pending', 'reverse'],
    ['failed', 'fail'],
  ] as const)('barra %s → %s', (status, acao) => {
    expect(transicao(status, acao, false)).toMatchObject({ ok: false, code: 'INVALID_TRANSITION' });
  });

  it('bloqueado (sem chave) só pode ser cancelado', () => {
    expect(transicao('pending', 'pay', true)).toMatchObject({ ok: false, code: 'PIX_KEY_MISSING' });
    expect(transicao('pending', 'fail', true)).toMatchObject({ ok: false, code: 'PIX_KEY_MISSING' });
    expect(transicao('pending', 'cancel', true)).toMatchObject({ ok: true, para: 'cancelled' });
  });
});

describe('chave Pix', () => {
  it('só serve a chave válida para o tipo', () => {
    expect(chavePixUtilizavel('cpf', CPF)).toBe(true);
    expect(chavePixUtilizavel('cpf', '11111111111')).toBe(false);
    expect(chavePixUtilizavel('cpf', '')).toBe(false);
    expect(chavePixUtilizavel(null, CPF)).toBe(false);
    expect(chavePixUtilizavel('email', 'a@b.com')).toBe(true);
    expect(chavePixUtilizavel('telefone', '5511999998888')).toBe(true);
  });

  it('mascara sem vazar a chave inteira', () => {
    expect(mascararPix('cpf', CPF)).toBe('***.***.***-25');
    expect(mascararPix('email', 'ana.silva@exemplo.com')).toBe('a***@exemplo.com');
    expect(mascararPix('telefone', '5511999998888')).toBe('(**) *****-8888');
    expect(mascararPix('aleatoria', '123e4567-e89b-12d3-a456-426614174000')).toBe('…14174000');
    expect(mascararPix('cpf', null)).toBeNull();
    for (const [t, c] of [
      ['cpf', CPF],
      ['email', 'ana.silva@exemplo.com'],
      ['telefone', '5511999998888'],
    ] as const) {
      expect(mascararPix(t, c)).not.toContain(c);
    }
  });
});

describe('lançamentos no razão', () => {
  /** Soma por semana de pagamento, como o razão faria. */
  const soma = (linhas: LinhaRazao[], em: 'semana' | 'corrente') =>
    linhas.filter((l) => l.em === em).reduce((a, l) => a + l.amount_cents, 0);

  it('pago exato: a semana paga fecha em zero e a corrente não muda', () => {
    const l = linhasDePagamento({ payout_id: 'p1', due_cents: 10000, paid_cents: 10000, semana: SEMANA, diff_reason: null });
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ kind: 'payout', amount_cents: -10000, em: 'semana' });
    expect(10000 + soma(l, 'semana')).toBe(0);
    expect(soma(l, 'corrente')).toBe(0);
  });

  it('pago a menos: semana zera, o resto vai UMA vez para a corrente e some quando pago', () => {
    const l = linhasDePagamento({ payout_id: 'p1', due_cents: 10000, paid_cents: 8000, semana: SEMANA, diff_reason: 'Pix menor por erro' });
    expect(10000 + soma(l, 'semana')).toBe(0);
    expect(soma(l, 'corrente')).toBe(2000);
    expect(l.filter((x) => x.em === 'corrente')).toHaveLength(1);
    // próxima semana: devido = fechado (5000) + ajuste (2000); pago exato fecha o razão do consultor em zero
    const prox = linhasDePagamento({ payout_id: 'p2', due_cents: 7000, paid_cents: 7000, semana: SEMANA, diff_reason: null });
    expect(10000 + soma(l, 'semana') + 5000 + soma(l, 'corrente') + soma(prox, 'semana')).toBe(0);
  });

  it('pago a mais: desconta da corrente', () => {
    const l = linhasDePagamento({ payout_id: 'p1', due_cents: 10000, paid_cents: 11000, semana: SEMANA, diff_reason: 'Pix a mais' });
    expect(10000 + soma(l, 'semana')).toBe(0);
    expect(soma(l, 'corrente')).toBe(-1000);
    expect(l.find((x) => x.kind === 'adjustment')).toMatchObject({ amount_cents: -1000, source: 'payout_difference' });
  });

  it('chaves de idempotência determinísticas por pagamento', () => {
    const a = linhasDePagamento({ payout_id: 'p1', due_cents: 10000, paid_cents: 8000, semana: SEMANA, diff_reason: 'x y z' });
    const b = linhasDePagamento({ payout_id: 'p1', due_cents: 10000, paid_cents: 8000, semana: SEMANA, diff_reason: 'x y z' });
    expect(a.map((x) => x.idempotency_key)).toEqual(b.map((x) => x.idempotency_key));
    expect(new Set(a.map((x) => x.idempotency_key)).size).toBe(a.length);
  });

  it.each([
    [10000, 10000],
    [10000, 8000],
    [10000, 12500],
  ])('estorno desfaz tudo (devido %i, pago %i)', (due, paid) => {
    const p = { payout_id: 'p1', due_cents: due, paid_cents: paid, semana: SEMANA };
    const ida = linhasDePagamento({ ...p, diff_reason: 'motivo da diferença' });
    const volta = linhasDeEstorno({ ...p, reason: 'Pix errado' });
    const todas = [...ida, ...volta];
    expect(soma(todas, 'semana')).toBe(0);
    expect(soma(todas, 'corrente')).toBe(0);
    expect(new Set(todas.map((x) => x.idempotency_key)).size).toBe(todas.length);
    expect(volta.some((x) => x.estorna_ajuste)).toBe(due !== paid);
  });

  it('saldo = fechado − pago líquido', () => {
    expect(saldoDaSemana(10000, [])).toBe(10000);
    expect(saldoDaSemana(10000, [-10000])).toBe(0);
    expect(saldoDaSemana(10000, [-8000, -2000])).toBe(0);
    expect(saldoDaSemana(10000, [-10000, 10000])).toBe(10000);
  });

  it('valida o valor pago', () => {
    expect(validarValorPago(1)).toEqual({ ok: true, cents: 1 });
    for (const v of [0, -5, 1.5, 10_000_001, '100', null, NaN]) expect(validarValorPago(v).ok).toBe(false);
  });
});

describe('comprovante', () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(8)]);
  const pdf = Buffer.from('%PDF-1.7\n...');

  it('reconhece JPEG, PNG e PDF pelos bytes', () => {
    expect(tipoDoComprovante(jpeg)).toBe('image/jpeg');
    expect(tipoDoComprovante(png)).toBe('image/png');
    expect(tipoDoComprovante(pdf)).toBe('application/pdf');
    expect(validarComprovante(pdf)).toEqual({ ok: true, mime: 'application/pdf', size: pdf.length });
  });

  it('recusa WEBP, GIF, texto renomeado e vazio', () => {
    const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')]);
    for (const b of [webp, Buffer.from('GIF89a......'), Buffer.from('<html>%PDF-</html>'), Buffer.from('PK\x03\x04zip')]) {
      expect(validarComprovante(b)).toMatchObject({ ok: false, code: 'INVALID_PROOF' });
    }
    expect(validarComprovante(Buffer.alloc(0))).toMatchObject({ ok: false, code: 'INVALID_PROOF' });
  });

  it('limite de 5 MB', () => {
    const limite = Buffer.concat([jpeg, Buffer.alloc(LIMITE_COMPROVANTE_BYTES - jpeg.length)]);
    expect(validarComprovante(limite).ok).toBe(true);
    const estouro = Buffer.concat([jpeg, Buffer.alloc(LIMITE_COMPROVANTE_BYTES - jpeg.length + 1)]);
    expect(validarComprovante(estouro)).toMatchObject({ ok: false, code: 'FILE_TOO_LARGE' });
  });
});

describe('resumo da fila e textos', () => {
  it('soma só o que falta pagar, mostra a conta e separa bloqueado/pago', () => {
    const r = resumirFila(
      [
        { status: 'pending', bloqueado: false, due_cents: 10000, paid_cents: null },
        { status: 'failed', bloqueado: false, due_cents: 25000, paid_cents: null },
        { status: 'pending', bloqueado: true, due_cents: 7000, paid_cents: null },
        { status: 'paid', bloqueado: false, due_cents: 5000, paid_cents: 5000 },
        { status: 'cancelled', bloqueado: false, due_cents: 999, paid_cents: null },
      ],
      SEMANA,
    );
    expect(r.to_pay_cents).toBe(35000);
    expect(r.blocked_cents).toBe(7000);
    expect(r.paid_cents).toBe(5000);
    expect(r.failed_cents).toBe(25000);
    expect(r.counts).toEqual({ pending: 1, blocked: 1, failed: 1, paid: 1, cancelled: 1 });
    expect(r.conta[0]).toBe('A pagar (19/10 a 25/10): R$ 100,00 + R$ 250,00 = R$ 350,00.');
  });

  it('data absoluta para o consultor', () => {
    const base = { bloqueado: false, due_cents: 18000, paid_cents: null, paid_at: null, pix_date: '2026-10-26', paid_day: null };
    expect(textoDoConsultor({ ...base, status: 'pending' }).text).toBe('Pix de R$ 180,00 a pagar em seg 26/10.');
    expect(textoDoConsultor({ ...base, status: 'pending', bloqueado: true }).label).toBe('Falta a chave Pix');
    expect(
      textoDoConsultor({ ...base, status: 'paid', paid_cents: 18000, paid_at: new Date(), paid_day: '2026-10-26' }).text,
    ).toBe('Pix de R$ 180,00 pago em 26/10/2026.');
  });
});

describe('CSV', () => {
  const linha = (o: Partial<LinhaCsv> = {}): LinhaCsv => ({
    week_start: '2026-10-19',
    week_end: '2026-10-25',
    consultor: 'Ana',
    praca: 'Moema',
    pix_key_type: 'cpf',
    pix_key: '***.***.***-25',
    due_cents: 123450,
    paid_cents: null,
    situacao: 'A pagar',
    paid_day: null,
    pix_date: '2026-10-26',
    observacao: null,
    ...o,
  });

  it('BOM, separador ; e valores em reais com vírgula e em centavos', () => {
    const csv = montarCsv([linha()]);
    expect(csv.startsWith(BOM)).toBe(true);
    const [cab, corpo] = csv.slice(1).split('\r\n');
    expect(cab.split(';')).toHaveLength(14);
    expect(corpo.split(';')).toHaveLength(14);
    expect(corpo).toContain(';1234,50;123450;');
    expect(csv.endsWith('\r\n')).toBe(true);
  });

  it('reais sem ponto flutuante', () => {
    expect(reaisCsv(5)).toBe('0,05');
    expect(reaisCsv(100)).toBe('1,00');
    expect(reaisCsv(-250)).toBe('-2,50');
  });

  it('escapa ; aspas e quebras', () => {
    expect(celulaTexto('a;b')).toBe('"a;b"');
    expect(celulaTexto('diz "oi"')).toBe('"diz ""oi"""');
    expect(celulaTexto('l1\nl2')).toBe('"l1\nl2"');
    expect(celulaTexto('simples')).toBe('simples');
    expect(celulaTexto(null)).toBe('');
  });

  it.each(['=1+1', '+55', '-2', '@SOMA(A1)', '\t=x', '\r=x'])('neutraliza fórmula %j', (v) => {
    const c = celulaTexto(v);
    expect(c.replace(/^"/, '').startsWith("'")).toBe(true);
  });

  it('neutraliza texto livre mas não toca os valores numéricos', () => {
    const csv = montarCsv([linha({ consultor: '=HYPERLINK("x")', observacao: '@cmd', due_cents: 100, paid_cents: 100 })]);
    const corpo = csv.slice(1).split('\r\n')[1];
    expect(corpo).toContain(`"'=HYPERLINK(""x"")"`);
    expect(corpo).toContain(";'@cmd");
    expect(corpo).toContain(';1,00;100;1,00;100;');
  });
});
