import { readFileSync } from 'fs';
import { join } from 'path';
import { normalizarPix } from '../../../../domain/campo-rules';
import type { RotasConfigService } from '../../../rotas/rotas-config.service';
import { A, AGORA, B, FakeInputs, FakeRepo, PRACA_1, PRACA_2 } from '../../earnings/__tests__/fakes';
import { EarningsService } from '../../earnings/earnings.service';
import { PayoutsLigadoGuard } from '../payouts.guard';
import { PayoutsService } from '../payouts.service';
import { CPF_VALIDO, FakePayoutsRepo, FakeStorage, JPEG, PDF } from './fakes';

const ADMIN = { id: 'dddddddd-0000-4000-8000-000000000001', name: 'Diego' };
const SIS = { id: null, name: 'sistema' };
const SEMANA = '2026-10-19';
const CORRENTE = '2026-10-26';
const CHAVE_EMAIL = 'beto.souza@exemplo.com';

function montar(o: { proofRequired?: boolean } = {}) {
  const repo = new FakeRepo();
  const inputs = new FakeInputs();
  const proof = { v: o.proofRequired ?? true };
  const config = {
    cadastro: async () => ({ confirmation_rule: 'activated' as const }),
    alertas: async () => ({ payout_proof_required: proof.v }),
  } as unknown as RotasConfigService;
  const earnings = new EarningsService(repo, inputs, config, { ligado: true, autoClose: false, janelaNaoConfirmadosDias: 45 });
  const prepo = new FakePayoutsRepo(repo);
  prepo.dados.set(A, { pix_key: CPF_VALIDO, pix_key_type: 'cpf', praca_name: 'Moema' });
  prepo.dados.set(B, { pix_key: CHAVE_EMAIL, pix_key_type: 'email', praca_name: 'Pinheiros' });
  const storage = new FakeStorage();
  const s = new PayoutsService(prepo, repo, inputs, earnings, config, storage);
  return { s, repo, inputs, earnings, prepo, storage, proof };
}

/** A fecha R$ 250,00 e B R$ 100,00 na semana 19–25/10. */
async function semanaFechada(m: ReturnType<typeof montar>) {
  m.inputs.set(A, '2026-10-20', { signups: 20 });
  m.inputs.set(B, '2026-10-21', { signups: 10 });
  await m.earnings.fechar({ week_start: SEMANA }, SIS, 'manual', AGORA);
}

const doRazao = (m: ReturnType<typeof montar>, id: string) =>
  m.repo.ledger.filter((l) => l.consultant_id === id);
const soma = (m: ReturnType<typeof montar>, id: string, f: (l: { payout_week: string }) => boolean = () => true) =>
  doRazao(m, id).filter(f).reduce((a, l) => a + l.amount_cents, 0);

async function filaGerada(m: ReturnType<typeof montar>) {
  await semanaFechada(m);
  const r = await m.s.gerar(SEMANA, ADMIN, AGORA);
  const dele = (c: string) => r.payouts.find((p) => p.consultant_id === c) as (typeof r.payouts)[number];
  return { r, pA: dele(A), pB: dele(B) };
}

describe('gerar a fila', () => {
  it('cria um pagamento por consultor/semana fechada com o valor do fechamento', async () => {
    const m = montar();
    const { r, pA, pB } = await filaGerada(m);
    expect(r).toMatchObject({ created: 2, blocked: 0, existing: 0, week: { from: SEMANA, to: '2026-10-25' } });
    expect(pA).toMatchObject({ due_cents: 25000, status: 'pending', blocked: false, pix_date: CORRENTE, pix_label: 'seg 26/10' });
    expect(pB.due_cents).toBe(10000);
  });

  it('rodar de novo não duplica', async () => {
    const m = montar();
    await filaGerada(m);
    const r = await m.s.gerar('2026-10-22', ADMIN, AGORA); // qualquer dia da semana
    expect(r).toMatchObject({ created: 0, existing: 2 });
    expect(m.prepo.payouts).toHaveLength(2);
  });

  it('semana não fechada = 409 WEEK_NOT_CLOSED', async () => {
    const m = montar();
    await expect(m.s.gerar(SEMANA, ADMIN, AGORA)).rejects.toMatchObject({ response: { code: 'WEEK_NOT_CLOSED' } });
  });

  it('total zero ou negativo não entra na fila', async () => {
    const m = montar();
    await semanaFechada(m);
    m.repo.periods.find((p) => p.consultant_id === B)!.total_cents = -500;
    const r = await m.s.gerar(SEMANA, ADMIN, AGORA);
    expect(r).toMatchObject({ created: 1, skipped_non_positive: 1 });
  });

  it('chave ausente ou inválida: nasce bloqueado, sem chave, visível', async () => {
    const m = montar();
    m.prepo.dados.set(B, { pix_key: '11111111111', pix_key_type: 'cpf', praca_name: 'Pinheiros' });
    const { r, pB } = await filaGerada(m);
    expect(r).toMatchObject({ created: 1, blocked: 1 });
    expect(pB).toMatchObject({ blocked: true, block_reason: 'NO_PIX_KEY', status: 'pending', pix_key_masked: null });
    expect(m.prepo.payouts.find((p) => p.consultant_id === B)?.pix_key).toBeNull();
    const lista = await m.s.listar({ week: SEMANA }, AGORA);
    expect(lista.summary).toMatchObject({ to_pay_cents: 25000, blocked_cents: 10000 });
    expect(lista.summary.conta.join(' ')).toContain('Bloqueado por falta de chave Pix');
  });

  it('bloqueado não pode ser pago; ao cadastrar a chave, gerar de novo recria com a chave atual', async () => {
    const m = montar({ proofRequired: false });
    m.prepo.dados.set(B, { pix_key: '', pix_key_type: 'cpf', praca_name: 'Pinheiros' });
    const { pB } = await filaGerada(m);
    await expect(m.s.pagar(pB.id, {}, ADMIN, AGORA)).rejects.toMatchObject({ response: { code: 'PIX_KEY_MISSING' } });
    m.prepo.dados.set(B, { pix_key: CHAVE_EMAIL, pix_key_type: 'email', praca_name: 'Pinheiros' });
    const r = await m.s.gerar(SEMANA, ADMIN, AGORA);
    expect(r).toMatchObject({ unblocked: 1, created: 1, existing: 1 });
    const ativos = m.prepo.payouts.filter((p) => p.consultant_id === B && p.status !== 'cancelled');
    expect(ativos).toHaveLength(1);
    expect(ativos[0]).toMatchObject({ block_reason: null, pix_key: CHAVE_EMAIL, due_cents: 10000 });
    expect(m.prepo.payouts.filter((p) => p.consultant_id === B)).toHaveLength(2); // o bloqueado ficou cancelado, não apagado
  });

  it('a chave Pix é fotografada: mudar o cadastro depois não muda o pagamento', async () => {
    const m = montar();
    await filaGerada(m);
    m.prepo.dados.set(A, { pix_key: 'outra@chave.com', pix_key_type: 'email', praca_name: 'Moema' });
    await m.s.gerar(SEMANA, ADMIN, AGORA);
    expect(m.prepo.payouts.find((p) => p.consultant_id === A)).toMatchObject({ pix_key: normalizarPix('cpf', CPF_VALIDO), pix_key_type: 'cpf' });
  });
});

describe('leitura e privacidade', () => {
  it('lista com a conta e sem a chave completa em lugar nenhum', async () => {
    const m = montar();
    await filaGerada(m);
    const lista = await m.s.listar({ week: SEMANA }, AGORA);
    expect(lista.summary.to_pay_cents).toBe(35000);
    expect(lista.summary.conta[0]).toBe('A pagar (19/10 a 25/10): R$ 250,00 + R$ 100,00 = R$ 350,00.');
    expect(lista.proof_required).toBe(true);
    const json = JSON.stringify(lista);
    expect(json).not.toContain(CPF_VALIDO);
    expect(json).not.toContain(CHAVE_EMAIL);
    expect(lista.payouts.find((p) => p.consultant_id === A)?.pix_key_masked).toBe('***.***.***-25');
    expect((await m.s.detalhe(lista.payouts[0].id, AGORA)).events.map((e) => e.type)).toEqual(['created']);
  });

  it('isolamento por praça: o filtro esconde a outra praça', async () => {
    const m = montar();
    await filaGerada(m);
    const l1 = await m.s.listar({ week: SEMANA, praca_id: PRACA_1 }, AGORA);
    expect(l1.payouts.map((p) => p.consultant_id)).toEqual([A]);
    const l2 = await m.s.listar({ week: SEMANA, praca_id: PRACA_2 }, AGORA);
    expect(l2.payouts.map((p) => p.consultant_id)).toEqual([B]);
    expect(l2.summary.to_pay_cents).toBe(10000);
  });

  it('a chave completa só sai em chavePix e deixa evento sem a chave', async () => {
    const m = montar();
    const { pA } = await filaGerada(m);
    expect(await m.s.chavePix(pA.id, ADMIN)).toEqual({ pix_key: normalizarPix('cpf', CPF_VALIDO), pix_key_type: 'cpf' });
    const ev = m.prepo.eventosGravados.filter((e) => e.type === 'pix_key_viewed');
    expect(ev).toHaveLength(1);
    expect(ev[0].actor_name).toBe('Diego');
    expect(JSON.stringify(m.prepo.eventosGravados)).not.toContain(CPF_VALIDO);
  });
});

describe('marcar como pago', () => {
  it('guarda o comprovante no storage privado, lança no razão e fecha o saldo da semana', async () => {
    const m = montar();
    const { pA } = await filaGerada(m);
    const r = await m.s.pagar(pA.id, { proof: PDF, note: 'Pix das 9h' }, ADMIN, AGORA);
    expect(r).toMatchObject({ status: 'paid', paid_cents: 25000, diff_cents: 0, has_proof: true, proof_mime: 'application/pdf', already_paid: false, balance_cents: 0, paid_by: 'Diego' });
    expect(m.storage.puts).toHaveLength(1);
    expect(m.storage.puts[0]).toMatch(new RegExp(`^pagamentos/${A}/[0-9a-f-]{36}\\.pdf$`));
    const p = doRazao(m, A).filter((l) => l.kind === 'payout');
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ amount_cents: -25000, payout_week: SEMANA, work_scope: 'manual', source: 'pix_manual' });
    expect(soma(m, A, (l) => l.payout_week === SEMANA)).toBe(0);
    expect(m.prepo.eventosGravados.map((e) => e.type)).toContain('paid');
    expect((await m.s.comprovante(pA.id)).mime).toBe('application/pdf');
  });

  it('é idempotente: pagar duas vezes não duplica evento, lançamento nem arquivo', async () => {
    const m = montar();
    const { pA } = await filaGerada(m);
    await m.s.pagar(pA.id, { proof: PDF }, ADMIN, AGORA);
    const eventos = m.prepo.eventosGravados.length;
    const lanc = m.repo.ledger.length;
    const r = await m.s.pagar(pA.id, { proof: JPEG }, ADMIN, AGORA);
    expect(r.already_paid).toBe(true);
    expect(m.prepo.eventosGravados).toHaveLength(eventos);
    expect(m.repo.ledger).toHaveLength(lanc);
    expect(m.storage.puts).toHaveLength(1);
  });

  it('duas chamadas ao mesmo tempo: uma paga, a outra vê pago (e o arquivo da perdedora é limpo)', async () => {
    const m = montar();
    const { pA } = await filaGerada(m);
    const [r1, r2] = await Promise.all([
      m.s.pagar(pA.id, { proof: PDF }, ADMIN, AGORA),
      m.s.pagar(pA.id, { proof: JPEG }, ADMIN, AGORA),
    ]);
    expect([r1.already_paid, r2.already_paid].sort()).toEqual([false, true]);
    expect(doRazao(m, A).filter((l) => l.kind === 'payout')).toHaveLength(1);
    expect(m.storage.arquivos.size).toBe(1);
  });

  it('comprovante obrigatório por padrão; opcional quando a configuração desliga', async () => {
    const m = montar();
    const { pA } = await filaGerada(m);
    await expect(m.s.pagar(pA.id, {}, ADMIN, AGORA)).rejects.toMatchObject({ response: { code: 'PROOF_REQUIRED' } });
    expect(m.prepo.payouts.find((p) => p.id === pA.id)?.status).toBe('pending');
    m.proof.v = false;
    const r = await m.s.pagar(pA.id, {}, ADMIN, AGORA);
    expect(r).toMatchObject({ status: 'paid', has_proof: false });
  });

  it('comprovante: bytes mágicos, tipo e limite de 5 MB', async () => {
    const m = montar();
    const { pA } = await filaGerada(m);
    await expect(m.s.pagar(pA.id, { proof: Buffer.from('GIF89a....') }, ADMIN, AGORA)).rejects.toMatchObject({ response: { code: 'INVALID_PROOF' }, status: 415 });
    await expect(m.s.pagar(pA.id, { proof: Buffer.from('<script>%PDF-</script>') }, ADMIN, AGORA)).rejects.toMatchObject({ response: { code: 'INVALID_PROOF' } });
    const grande = Buffer.concat([JPEG, Buffer.alloc(5 * 1024 * 1024)]);
    await expect(m.s.pagar(pA.id, { proof: grande }, ADMIN, AGORA)).rejects.toMatchObject({ response: { code: 'FILE_TOO_LARGE' }, status: 413 });
    expect(m.storage.puts).toHaveLength(0);
    expect(m.prepo.payouts.find((p) => p.id === pA.id)?.status).toBe('pending');
  });

  it('falha no meio da transação: o arquivo enviado é removido', async () => {
    const m = montar();
    const { pA } = await filaGerada(m);
    m.prepo.falharNoRazao = true;
    await expect(m.s.pagar(pA.id, { proof: PDF }, ADMIN, AGORA)).rejects.toThrow('falha simulada');
    expect(m.storage.puts).toHaveLength(1);
    expect(m.storage.removidos).toEqual(m.storage.puts);
    expect(m.storage.arquivos.size).toBe(0);
  });

  it('valor pago diferente do devido exige motivo', async () => {
    const m = montar();
    const { pA } = await filaGerada(m);
    await expect(m.s.pagar(pA.id, { proof: PDF, paid_cents: 20000 }, ADMIN, AGORA)).rejects.toMatchObject({ response: { code: 'REASON_REQUIRED' } });
    await expect(m.s.pagar(pA.id, { proof: PDF, paid_cents: 20000, reason: 'ab' }, ADMIN, AGORA)).rejects.toMatchObject({ response: { code: 'REASON_REQUIRED' } });
    for (const v of [0, -1, 1.5, 10_000_001]) {
      await expect(m.s.pagar(pA.id, { proof: PDF, paid_cents: v, reason: 'motivo ok' }, ADMIN, AGORA)).rejects.toMatchObject({ response: { code: 'VALIDATION_ERROR' } });
    }
    expect(m.storage.puts).toHaveLength(0);
  });

  it.each([
    ['a menos', 20000, 5000],
    ['a mais', 27000, -2000],
  ])('pago %s: o razão da semana zera e a diferença entra UMA vez na corrente', async (_n, pago, diff) => {
    const m = montar();
    const { pA } = await filaGerada(m);
    const r = await m.s.pagar(pA.id, { proof: PDF, paid_cents: pago, reason: 'Pix saiu com valor diferente' }, ADMIN, AGORA);
    expect(r).toMatchObject({ paid_cents: pago, diff_cents: 25000 - pago, diff_reason: 'Pix saiu com valor diferente', balance_cents: 0 });
    expect(soma(m, A, (l) => l.payout_week === SEMANA)).toBe(0);
    const ajustes = doRazao(m, A).filter((l) => l.kind === 'adjustment');
    expect(ajustes).toHaveLength(1);
    expect(ajustes[0]).toMatchObject({ amount_cents: diff, payout_week: CORRENTE, source: 'payout_difference' });
    await m.s.pagar(pA.id, { proof: PDF }, ADMIN, AGORA);
    expect(doRazao(m, A).filter((l) => l.kind === 'adjustment')).toHaveLength(1);
  });

  it('duas semanas: pagar a menos, a diferença sai no Pix seguinte e o razão do consultor termina em zero', async () => {
    const m = montar();
    const { pA } = await filaGerada(m);
    await m.s.pagar(pA.id, { proof: PDF, paid_cents: 20000, reason: 'Pix menor por engano' }, ADMIN, AGORA);
    // semana 26/10: A faz 4 cadastros (R$ 40) + o ajuste de R$ 50 = R$ 90
    m.inputs.set(A, '2026-10-27', { signups: 4 });
    const DEPOIS = new Date('2026-11-03T13:00:00.000Z');
    await m.earnings.fechar({ week_start: CORRENTE }, SIS, 'manual', DEPOIS);
    expect(m.repo.periods.find((p) => p.consultant_id === A && p.week_start === CORRENTE)?.total_cents).toBe(9000);
    const g = await m.s.gerar(CORRENTE, ADMIN, DEPOIS);
    const p2 = g.payouts.find((p) => p.consultant_id === A)!;
    expect(p2.due_cents).toBe(9000);
    await m.s.pagar(p2.id, { proof: PDF }, ADMIN, DEPOIS);
    expect(soma(m, A)).toBe(0);
  });

  it('pagar não mexe na semana aberta: o total e o fechamento seguintes ficam iguais', async () => {
    const mA = montar();
    const mB = montar();
    for (const m of [mA, mB]) m.inputs.set(A, '2026-10-27', { signups: 3 });
    const { pA } = await filaGerada(mA);
    await semanaFechada(mB);
    await mA.s.pagar(pA.id, { proof: PDF }, ADMIN, AGORA);
    const antes = await mB.earnings.equipe({ week: CORRENTE, consultant_id: A }, AGORA);
    const depois = await mA.earnings.equipe({ week: CORRENTE, consultant_id: A }, AGORA);
    expect(depois.consultants[0].total_cents).toBe(antes.consultants[0].total_cents);
    expect(depois.consultants[0].extras_cents).toBe(0);
    const DEPOIS = new Date('2026-11-03T13:00:00.000Z');
    const fA = await mA.earnings.fechar({ week_start: CORRENTE, consultant_id: A }, SIS, 'manual', DEPOIS);
    const fB = await mB.earnings.fechar({ week_start: CORRENTE, consultant_id: A }, SIS, 'manual', DEPOIS);
    expect(fA.total_cents).toBe(fB.total_cents);
    expect(fA.total_cents).toBe(3000);
    // e a extração do razão (visão da F8) não lista os lançamentos de pagamento
    const ext = await mA.earnings.equipe({ week: SEMANA, consultant_id: A }, AGORA);
    expect((ext.ledger ?? []).some((l) => l.kind.startsWith('payout'))).toBe(false);
  });

  it('o ajuste gerado por diferença não é estornável pela rota da F8', async () => {
    const m = montar();
    const { pA } = await filaGerada(m);
    await m.s.pagar(pA.id, { proof: PDF, paid_cents: 20000, reason: 'Pix menor por engano' }, ADMIN, AGORA);
    const aj = doRazao(m, A).find((l) => l.kind === 'adjustment')!;
    await expect(
      m.earnings.estornar(aj.id, { reason: 'quero desfazer', client_id: 'cccccccc-0000-4000-8000-000000000001' }, { id: ADMIN.id, name: ADMIN.name, email: 'a@x', is_admin: true }, AGORA),
    ).rejects.toMatchObject({ response: { code: 'NOT_REVERSIBLE' } });
  });
});

describe('transições e auditoria', () => {
  it('falhou → tentar de novo (manual) → pago; cada passo deixa evento com autor', async () => {
    const m = montar({ proofRequired: false });
    const { pA } = await filaGerada(m);
    await expect(m.s.mudar(pA.id, 'fail', 'x', ADMIN, AGORA)).rejects.toMatchObject({ response: { code: 'VALIDATION_ERROR' } });
    const f = await m.s.mudar(pA.id, 'fail', 'Banco recusou: chave inexistente', ADMIN, AGORA);
    expect(f).toMatchObject({ status: 'failed', last_reason: 'Banco recusou: chave inexistente' });
    expect((await m.s.alertas()).map((a) => a.kind)).toEqual(['pix_falhou']);
    await m.s.mudar(pA.id, 'retry', null, ADMIN, AGORA);
    expect((await m.s.pagar(pA.id, {}, ADMIN, AGORA)).status).toBe('paid');
    const tipos = (await m.s.detalhe(pA.id, AGORA)).events.map((e) => [e.type, e.actor]);
    expect(tipos).toEqual([['created', 'Diego'], ['failed', 'Diego'], ['retried', 'Diego'], ['paid', 'Diego']]);
    expect(await m.s.alertas()).toEqual([]);
  });

  it('transições inválidas dão 409 e não escrevem nada', async () => {
    const m = montar({ proofRequired: false });
    const { pA } = await filaGerada(m);
    await m.s.pagar(pA.id, {}, ADMIN, AGORA);
    const n = m.prepo.eventosGravados.length;
    for (const a of ['fail', 'retry', 'cancel'] as const) {
      await expect(m.s.mudar(pA.id, a, 'motivo qualquer', ADMIN, AGORA)).rejects.toMatchObject({ response: { code: 'INVALID_TRANSITION' } });
    }
    expect(m.prepo.eventosGravados).toHaveLength(n);
  });

  it('cancelar exige motivo; cancelado não volta e a semana pode ser gerada de novo', async () => {
    const m = montar();
    const { pA } = await filaGerada(m);
    await expect(m.s.mudar(pA.id, 'cancel', '', ADMIN, AGORA)).rejects.toMatchObject({ response: { code: 'VALIDATION_ERROR' } });
    await m.s.mudar(pA.id, 'cancel', 'Consultor pediu para esperar', ADMIN, AGORA);
    await expect(m.s.pagar(pA.id, { proof: PDF }, ADMIN, AGORA)).rejects.toMatchObject({ response: { code: 'INVALID_TRANSITION' } });
    const r = await m.s.gerar(SEMANA, ADMIN, AGORA);
    expect(r.created).toBe(1);
    expect(m.prepo.payouts.filter((p) => p.consultant_id === A)).toHaveLength(2);
  });

  it.each([
    ['exato', 25000],
    ['a menos', 20000],
  ])('estornar um pagamento (%s) devolve o razão ao estado de antes e libera um novo', async (_n, pago) => {
    const m = montar();
    const { pA } = await filaGerada(m);
    await m.s.pagar(pA.id, { proof: PDF, paid_cents: pago, ...(pago !== 25000 ? { reason: 'Pix menor por engano' } : {}) }, ADMIN, AGORA);
    const r = await m.s.mudar(pA.id, 'reverse', 'Pix devolvido pelo banco', ADMIN, AGORA);
    expect(r.status).toBe('cancelled');
    expect(soma(m, A, (l) => l.payout_week === SEMANA)).toBe(25000);
    expect(soma(m, A, (l) => l.payout_week === CORRENTE)).toBe(0);
    expect((await m.s.mudar(pA.id, 'reverse', 'de novo', ADMIN, AGORA).catch((e) => e.response.code))).toBe('INVALID_TRANSITION');
    const g = await m.s.gerar(SEMANA, ADMIN, AGORA);
    expect(g.created).toBe(1);
    expect((await m.s.detalhe(pA.id, AGORA)).events.map((e) => e.type)).toEqual(['created', 'paid', 'reversed']);
  });

  it('alerta de Pix bloqueado aparece com o motivo', async () => {
    const m = montar();
    m.prepo.dados.set(B, { pix_key: '', pix_key_type: 'cpf', praca_name: 'Pinheiros' });
    await filaGerada(m);
    const al = await m.s.alertas();
    expect(al).toHaveLength(1);
    expect(al[0]).toMatchObject({ kind: 'pix_bloqueado', name: 'Beto' });
    expect(al[0].message).toContain('falta a chave Pix');
    expect(await m.s.alertas(PRACA_1)).toEqual([]);
  });
});

describe('consultor', () => {
  const CA = { id: A } as never;
  const CB = { id: B } as never;

  it('vê só os próprios pagamentos, com data absoluta e sem chave Pix', async () => {
    const m = montar();
    await filaGerada(m);
    const r = await m.s.doConsultor(CA, AGORA);
    expect(r.payouts).toHaveLength(1);
    expect(r.payouts[0]).toMatchObject({ due_cents: 25000, status: 'pending', pix_label: 'seg 26/10', label: 'A pagar', text: 'Pix de R$ 250,00 a pagar em seg 26/10.' });
    expect(JSON.stringify(r)).not.toContain(CPF_VALIDO);
    expect((await m.s.doConsultor(CB, AGORA)).payouts.map((p) => p.due_cents)).toEqual([10000]);
  });

  it('comprovante de outro consultor = 404; o próprio sai', async () => {
    const m = montar();
    const { pA } = await filaGerada(m);
    await m.s.pagar(pA.id, { proof: PDF }, ADMIN, AGORA);
    await expect(m.s.comprovanteDoConsultor(pA.id, CB)).rejects.toMatchObject({ status: 404 });
    expect((await m.s.comprovanteDoConsultor(pA.id, CA)).mime).toBe('application/pdf');
    await expect(m.s.comprovanteDoConsultor('ffffffff-0000-4000-8000-000000000000', CA)).rejects.toMatchObject({ status: 404 });
  });

  it('pagamento pago mostra "pago em" absoluto', async () => {
    const m = montar();
    const { pA } = await filaGerada(m);
    await m.s.pagar(pA.id, { proof: PDF }, ADMIN, AGORA);
    const r = await m.s.doConsultor(CA, AGORA);
    expect(r.payouts[0]).toMatchObject({ status: 'paid', label: 'Pago', has_proof: true, text: 'Pix de R$ 250,00 pago em 27/10/2026.' });
  });
});

describe('CSV', () => {
  it('mascarado por padrão, UTF-8 com BOM, ; e valores em reais e em centavos, sem evento', async () => {
    const m = montar();
    await filaGerada(m);
    const { csv, filename } = await m.s.exportarCsv({ week: SEMANA }, ADMIN, AGORA);
    expect(filename).toBe('pagamentos-pix-2026-10-19.csv');
    expect(csv.startsWith('﻿')).toBe(true);
    const linhas = csv.slice(1).trimEnd().split('\r\n');
    expect(linhas).toHaveLength(3);
    expect(linhas[1]).toContain('Ana;Moema;cpf;***.***.***-25;250,00;25000;');
    expect(csv).not.toContain(CPF_VALIDO);
    expect(csv).not.toContain(CHAVE_EMAIL);
    expect(m.prepo.eventosGravados.filter((e) => e.type === 'exported')).toHaveLength(0);
  });

  it('com a chave completa (admin): inclui e audita uma exportação por pagamento, sem a chave no evento', async () => {
    const m = montar();
    await filaGerada(m);
    const { csv } = await m.s.exportarCsv({ week: SEMANA, include_pix_key: true }, ADMIN, AGORA);
    expect(csv).toContain(`;${CPF_VALIDO};`);
    expect(csv).toContain(CHAVE_EMAIL);
    const ev = m.prepo.eventosGravados.filter((e) => e.type === 'exported');
    expect(ev).toHaveLength(2);
    expect(JSON.stringify(ev)).not.toContain(CPF_VALIDO);
  });

  it('neutraliza fórmula no nome e na observação; cancelados ficam fora; filtro de praça vale', async () => {
    const m = montar();
    m.inputs.lista[0] = { ...m.inputs.lista[0], name: '=HYPERLINK("http://x")' };
    const { pA, pB } = await filaGerada(m);
    await m.s.mudar(pB.id, 'cancel', 'Cancelado a pedido', ADMIN, AGORA);
    await m.s.pagar(pA.id, { proof: PDF, paid_cents: 24000, reason: '+55 11 acerto; "entrada"' }, ADMIN, AGORA);
    const { csv } = await m.s.exportarCsv({ week: SEMANA }, ADMIN, AGORA);
    const linhas = csv.slice(1).trimEnd().split('\r\n');
    expect(linhas).toHaveLength(2);
    expect(linhas[1]).toContain(`"'=HYPERLINK(""http://x"")"`);
    expect(linhas[1]).toContain(`"'+55 11 acerto; ""entrada"""`);
    expect(linhas[1]).toContain(';240,00;24000;Pago;2026-10-27;');
    const so2 = await m.s.exportarCsv({ week: SEMANA, praca_id: PRACA_2 }, ADMIN, AGORA);
    expect(so2.csv.slice(1).trimEnd().split('\r\n')).toHaveLength(1); // só o cabeçalho (B cancelado)
  });
});

describe('flags e infraestrutura', () => {
  it('flag desligada = 404 PAYOUTS_DISABLED em todas as rotas (guard)', () => {
    const off = new PayoutsLigadoGuard({ ligado: false });
    expect(() => off.canActivate()).toThrow(expect.objectContaining({ status: 404, response: expect.objectContaining({ code: 'PAYOUTS_DISABLED' }) }));
    expect(new PayoutsLigadoGuard({ ligado: true }).canActivate()).toBe(true);
  });

  it('a flag é falsa por padrão e depende da remuneração', () => {
     
    const { validateEnv } = require('../../../../common/config/env.validation');
    const base = { DATABASE_URL: 'postgresql://x', JWT_SECRET: 'x'.repeat(40) } as NodeJS.ProcessEnv;
    expect(validateEnv(base).FIELD_PAYOUTS_ENABLED).toBe('false');
     
    const { payoutsOpcoesProvider } = require('../payouts.tokens');
    const roda = (env: Record<string, string>) => {
      const antes = { ...process.env };
      Object.assign(process.env, base, env);
      try {
        return (payoutsOpcoesProvider as { useFactory: () => { ligado: boolean } }).useFactory().ligado;
      } finally {
        process.env = antes;
      }
    };
    expect(roda({ FIELD_PAYOUTS_ENABLED: 'true', FIELD_EARNINGS_ENABLED: 'false' })).toBe(false);
    expect(roda({ FIELD_PAYOUTS_ENABLED: 'false', FIELD_EARNINGS_ENABLED: 'true' })).toBe(false);
    expect(roda({ FIELD_PAYOUTS_ENABLED: 'true', FIELD_EARNINGS_ENABLED: 'true' })).toBe(true);
  });

  it('a migração protege o banco: único parcial, trigger de eventos, guarda do pagamento e kinds do razão', () => {
    const sql = readFileSync(
      join(__dirname, '..', '..', '..', '..', '..', 'prisma', 'migrations', '20261024100000_field_payouts', 'migration.sql'),
      'utf8',
    );
    expect(sql).toContain(`WHERE "status" <> 'cancelled'`);
    expect(sql).toMatch(/TRIGGER "field_payout_events_immutable" BEFORE UPDATE OR DELETE/);
    expect(sql).toMatch(/TRIGGER "field_payouts_guard" BEFORE UPDATE OR DELETE/);
    expect(sql).toContain(`'payout', 'payout_reversal', 'payout_settlement'`);
    expect(sql).toContain('"due_cents" > 0');
    expect(sql).not.toMatch(/DROP INDEX/);
  });
});
