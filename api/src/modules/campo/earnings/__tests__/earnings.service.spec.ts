import type { AuthUser } from '../../../../common/auth/auth-user';
import { REGRA_PADRAO } from '../../../../domain/earnings-rules';
import type { RotasConfigService } from '../../../rotas/rotas-config.service';
import { EarningsService } from '../earnings.service';
import { A, AGORA, B, FakeInputs, FakeRepo, PRACA_1 } from './fakes';

const ADMIN: AuthUser = { id: 'dddddddd-0000-4000-8000-000000000001', email: 'a@x.com', name: 'Diego', is_admin: true };
const SIS = { id: null, name: 'sistema' };
const SEMANA_ANT = '2026-10-19';
const SEMANA_ATUAL = '2026-10-26';
const CID = (n: number) => `eeeeeeee-0000-4000-8000-${String(n).padStart(12, '0')}`;

function montar(opts: { autoClose?: boolean } = {}) {
  const repo = new FakeRepo();
  const inputs = new FakeInputs();
  const config = { cadastro: async () => ({ confirmation_rule: 'activated' as const }) } as unknown as RotasConfigService;
  const s = new EarningsService(repo, inputs, config, { ligado: true, autoClose: opts.autoClose ?? false, janelaNaoConfirmadosDias: 45 });
  return { s, repo, inputs };
}

const somaLedger = (repo: FakeRepo, id: string, payout: string) => repo.ledger.filter((l) => l.consultant_id === id && l.payout_week === payout).reduce((a, l) => a + l.amount_cents, 0);

describe('fechamento semanal', () => {
  it('fecha a semana encerrada: lança por dia, soma o razão e grava o fechamento', async () => {
    const { s, repo, inputs } = montar();
    inputs.set(A, '2026-10-19', { signups: 4 });
    inputs.set(A, '2026-10-20', { signups: 20 });
    inputs.set(B, '2026-10-21', { signups: 10 });
    const r = await s.fechar({ week_start: SEMANA_ANT }, { id: ADMIN.id, name: ADMIN.name }, 'manual', AGORA);

    expect(r).toMatchObject({ week: { from: '2026-10-19', to: '2026-10-25' }, closed: 2, already_closed: 0, total_cents: 4000 + 25000 + 10000 });
    expect(repo.periods).toHaveLength(2);
    expect(repo.periods.find((p) => p.consultant_id === A)).toMatchObject({ total_cents: 29000, status: 'closed', closed_mode: 'manual', closed_by_name: 'Diego', rule_version: 1 });
    const doA = repo.ledger.filter((l) => l.consultant_id === A);
    expect(doA.map((l) => [l.work_day, l.amount_cents]).sort()).toEqual([['2026-10-19', 4000], ['2026-10-20', 25000]]);
    // fotografia: regra completa, regra de confirmação, entradas e a conta escrita
    const dia20 = doA.find((l) => l.work_day === '2026-10-20');
    expect(dia20).toMatchObject({ kind: 'accrual', work_scope: 'day', work_week: SEMANA_ANT, payout_week: SEMANA_ANT, rule_version: 1, source: 'weekly_close' });
    expect(dia20?.snapshot).toMatchObject({ rule_version: 1, rule: REGRA_PADRAO, confirmation_rule: 'activated', confirmation_day_field: 'activated_day', inputs: { signups: 20 } });
    expect((dia20?.snapshot.conta as string[]).at(-1)).toBe('Total do dia: R$ 250,00.');
  });

  it('repetir o fechamento não duplica nada (idempotente)', async () => {
    const { s, repo, inputs } = montar();
    inputs.set(A, '2026-10-19', { signups: 4 });
    await s.fechar({ week_start: SEMANA_ANT }, SIS, 'auto', AGORA);
    const antes = JSON.stringify(repo.ledger.map((l) => l.id));
    const r = await s.fechar({ week_start: SEMANA_ANT }, SIS, 'auto', AGORA);
    expect(r).toMatchObject({ closed: 0, already_closed: 2, total_cents: 4000 });
    expect(JSON.stringify(repo.ledger.map((l) => l.id))).toBe(antes);
    expect(repo.periods).toHaveLength(2);
  });

  it('dois fechamentos ao mesmo tempo (cron × clique do admin): um fecha, o outro vê fechado', async () => {
    const { s, repo, inputs } = montar();
    inputs.set(A, '2026-10-19', { signups: 12 });
    const [x, y] = await Promise.all([
      s.fechar({ week_start: SEMANA_ANT, consultant_id: A }, SIS, 'auto', AGORA),
      s.fechar({ week_start: SEMANA_ANT, consultant_id: A }, { id: ADMIN.id, name: 'Diego' }, 'manual', AGORA),
    ]);
    expect(x.closed + y.closed).toBe(1);
    expect(x.already_closed + y.already_closed).toBe(1);
    expect(repo.periods).toHaveLength(1);
    expect(repo.ledger).toHaveLength(1);
    expect(repo.periods[0]?.total_cents).toBe(12000);
  });

  it('só fecha semana encerrada; semana corrente e futura dão 409 WEEK_NOT_ENDED', async () => {
    const { s, repo } = montar();
    await expect(s.fechar({ week_start: SEMANA_ATUAL }, SIS, 'manual', AGORA)).rejects.toMatchObject({ response: { code: 'WEEK_NOT_ENDED' } });
    await expect(s.fechar({ week_start: '2026-11-02' }, SIS, 'manual', AGORA)).rejects.toMatchObject({ response: { code: 'WEEK_NOT_ENDED' } });
    expect(repo.periods).toHaveLength(0);
  });

  it('domingo à noite ainda é a semana corrente; segunda 00:00 de Brasília encerra', async () => {
    const { s } = montar();
    const domingo2359 = new Date('2026-10-26T02:59:00.000Z'); // domingo 25/10 23:59 BRT
    await expect(s.fechar({ week_start: SEMANA_ANT }, SIS, 'manual', domingo2359)).rejects.toMatchObject({ response: { code: 'WEEK_NOT_ENDED' } });
    const segunda0000 = new Date('2026-10-26T03:00:00.000Z');
    await expect(s.fechar({ week_start: SEMANA_ANT }, SIS, 'manual', segunda0000)).resolves.toMatchObject({ closed: 2 });
  });

  it('week_start que não é início de semana = 400; consultor inexistente = 404', async () => {
    const { s } = montar();
    await expect(s.fechar({ week_start: '2026-10-21' }, SIS, 'manual', AGORA)).rejects.toMatchObject({ response: { code: 'VALIDATION_ERROR' } });
    await expect(s.fechar({ week_start: SEMANA_ANT, consultant_id: CID(9) }, SIS, 'manual', AGORA)).rejects.toMatchObject({ response: { code: 'NOT_FOUND' } });
  });

  it('semana fechada não reabre: ajuste feito depois cai na semana corrente e o fechamento não muda', async () => {
    const { s, repo, inputs } = montar();
    inputs.set(A, '2026-10-19', { signups: 5 });
    await s.fechar({ week_start: SEMANA_ANT, consultant_id: A }, SIS, 'auto', AGORA);
    const total = repo.periods[0]?.total_cents;
    const aj = await s.ajustar({ consultant_id: A, amount_cents: 3000, reason: 'Bônus de indicação', client_id: CID(1) }, ADMIN, AGORA);
    expect(aj).toMatchObject({ kind: 'adjustment', payout_week: SEMANA_ATUAL, work_scope: 'manual' });
    expect(repo.periods[0]?.total_cents).toBe(total);
    expect(somaLedger(repo, A, SEMANA_ANT)).toBe(total);
  });

  it('um consultor sem movimento fecha com total zero; consultor criado depois da semana não entra', async () => {
    const um = montar();
    const r = await um.s.fechar({ week_start: SEMANA_ANT }, SIS, 'manual', AGORA);
    expect(r.closed).toBe(2);
    expect(um.repo.periods.every((p) => p.total_cents === 0)).toBe(true);

    const dois = montar();
    dois.inputs.lista[1] = { ...dois.inputs.lista[1]!, created_day: '2026-10-26' };
    const r2 = await dois.s.fechar({ week_start: SEMANA_ANT }, SIS, 'manual', AGORA);
    expect(r2.closed).toBe(1);
    expect(dois.repo.periods.map((p) => p.consultant_id)).toEqual([A]);
  });
});

describe('leitura = fechamento (uma conta só)', () => {
  it('o total mostrado antes de fechar é exatamente o que o fechamento grava', async () => {
    const { s, repo, inputs } = montar();
    inputs.set(A, '2026-10-19', { signups: 7 });
    inputs.set(A, '2026-10-22', { signups: 25 });
    const antes = await s.equipe({ week: SEMANA_ANT, consultant_id: A }, AGORA);
    expect(antes.consultants[0]).toMatchObject({ status: 'open', total_cents: 7000 + 25000, confirmed_signups: 32 });
    expect(repo.ledger).toHaveLength(0); // ler não grava
    await s.fechar({ week_start: SEMANA_ANT, consultant_id: A }, SIS, 'manual', AGORA);
    const depois = await s.equipe({ week: SEMANA_ANT, consultant_id: A }, AGORA);
    expect(depois.consultants[0]).toMatchObject({ status: 'closed', total_cents: 32000 });
    expect(depois.ledger?.length).toBe(2);
  });

  it('a conta da semana é escrita, dia a dia', async () => {
    const { s, inputs } = montar();
    inputs.set(A, '2026-10-19', { signups: 4 });
    const r = await s.equipe({ week: SEMANA_ANT, consultant_id: A }, AGORA);
    const conta = r.consultants[0]?.conta ?? [];
    expect(conta).toContain('seg 19/10: R$ 40,00 (4 cadastros confirmados).');
    expect(conta.at(-1)).toBe('Total a pagar até agora: R$ 40,00.');
  });

  it('qualquer dia da semana serve de filtro; a semana vem de segunda a domingo', async () => {
    const { s } = montar();
    const r = await s.equipe({ week: '2026-10-25' }, AGORA);
    expect(r.week).toEqual({ from: SEMANA_ANT, to: '2026-10-25' });
  });

  it('filtro de praça: consultor da outra praça não aparece', async () => {
    const { s } = montar();
    const r = await s.equipe({ week: SEMANA_ANT, praca_id: PRACA_1 }, AGORA);
    expect(r.consultants.map((c) => c.consultant_id)).toEqual([A]);
  });

  it('consultor inexistente = 404', async () => {
    const { s } = montar();
    await expect(s.equipe({ consultant_id: CID(9) }, AGORA)).rejects.toMatchObject({ response: { code: 'NOT_FOUND' } });
  });
});

describe('confirmação tardia', () => {
  async function comSemanaFechada() {
    const ctx = montar();
    ctx.inputs.set(A, '2026-10-19', { signups: 4 });
    await ctx.s.fechar({ week_start: SEMANA_ANT, consultant_id: A }, SIS, 'auto', AGORA);
    return ctx;
  }

  it('o Freela confirma depois do fechamento: o delta entra na semana corrente, a fechada fica igual', async () => {
    const { s, repo, inputs } = await comSemanaFechada();
    inputs.set(A, '2026-10-19', { signups: 10 }); // sobe de 4 para 10 → R$ 100 (faixa) em vez de R$ 40
    const antes = await s.equipe({ week: SEMANA_ATUAL, consultant_id: A }, AGORA);
    expect(antes.consultants[0]?.extras_cents).toBe(6000); // aparece mesmo antes de lançar
    expect(antes.consultants[0]?.total_cents).toBe(6000);

    const r = await s.reconciliar({ consultant_id: A }, SIS, AGORA);
    expect(r).toEqual({ posted: 1, total_cents: 6000 });
    const l = repo.ledger.find((x) => x.source === 'late_confirmation');
    expect(l).toMatchObject({ amount_cents: 6000, work_day: '2026-10-19', work_week: SEMANA_ANT, payout_week: SEMANA_ATUAL, idempotency_key: 'acc:day:2026-10-19:2' });
    expect(repo.periods.find((p) => p.week_start === SEMANA_ANT)?.total_cents).toBe(4000);
    expect(somaLedger(repo, A, SEMANA_ANT)).toBe(4000);

    const depois = await s.equipe({ week: SEMANA_ATUAL, consultant_id: A }, AGORA);
    expect(depois.consultants[0]?.total_cents).toBe(6000); // mesmo número antes e depois de lançar
  });

  it('reconciliar de novo não duplica', async () => {
    const { s, repo, inputs } = await comSemanaFechada();
    inputs.set(A, '2026-10-19', { signups: 10 });
    await s.reconciliar({}, SIS, AGORA);
    const n = repo.ledger.length;
    const r = await s.reconciliar({}, SIS, AGORA);
    expect(r.posted).toBe(0);
    expect(repo.ledger).toHaveLength(n);
  });

  it('fora do prazo (late_grace_days) nada é lançado', async () => {
    const { s, repo, inputs } = await comSemanaFechada();
    inputs.set(A, '2026-10-19', { signups: 10 });
    const muitoDepois = new Date('2026-11-17T13:00:00.000Z'); // 23 dias após o fim da semana (prazo 14)
    const r = await s.reconciliar({}, SIS, muitoDepois);
    expect(r.posted).toBe(0);
    expect(repo.ledger.every((l) => l.source !== 'late_confirmation')).toBe(true);
  });

  it('semana ainda aberta não gera tardio: o valor é só recalculado', async () => {
    const { s, repo, inputs } = montar();
    inputs.set(A, '2026-10-19', { signups: 4 });
    const r = await s.reconciliar({}, SIS, AGORA);
    expect(r.posted).toBe(0);
    expect(repo.ledger).toHaveLength(0);
  });

  it('o valor que sobe e volta ao mesmo número não repete chave de idempotência', async () => {
    const { s, repo, inputs } = await comSemanaFechada();
    inputs.set(A, '2026-10-19', { signups: 10 });
    await s.reconciliar({}, SIS, AGORA);
    inputs.set(A, '2026-10-19', { signups: 4 }); // regra de confirmação mais rígida voltou ao antigo
    await s.reconciliar({}, SIS, AGORA);
    const chaves = repo.ledger.filter((l) => l.work_day === '2026-10-19').map((l) => l.idempotency_key);
    expect(chaves).toEqual(['acc:day:2026-10-19:1', 'acc:day:2026-10-19:2', 'acc:day:2026-10-19:3']);
    expect(new Set(chaves).size).toBe(3);
    expect(repo.ledger.filter((l) => l.work_day === '2026-10-19').reduce((a, l) => a + l.amount_cents, 0)).toBe(4000);
  });
});

describe('ajustes e estornos (nunca editam o passado)', () => {
  it('ajuste exige motivo, valor ≠ 0 e consultor existente', async () => {
    const { s, repo } = montar();
    await expect(s.ajustar({ consultant_id: A, amount_cents: 500, reason: '  ', client_id: CID(1) }, ADMIN, AGORA)).rejects.toMatchObject({ response: { code: 'VALIDATION_ERROR' } });
    await expect(s.ajustar({ consultant_id: A, amount_cents: 0, reason: 'sem valor', client_id: CID(1) }, ADMIN, AGORA)).rejects.toMatchObject({ response: { code: 'VALIDATION_ERROR' } });
    await expect(s.ajustar({ consultant_id: CID(9), amount_cents: 500, reason: 'motivo', client_id: CID(1) }, ADMIN, AGORA)).rejects.toMatchObject({ response: { code: 'NOT_FOUND' } });
    expect(repo.ledger).toHaveLength(0);
  });

  it('repetir o mesmo client_id devolve o mesmo lançamento (rede ruim)', async () => {
    const { s, repo } = montar();
    const a = await s.ajustar({ consultant_id: A, amount_cents: 500, reason: 'Gasolina', client_id: CID(1) }, ADMIN, AGORA);
    const b = await s.ajustar({ consultant_id: A, amount_cents: 500, reason: 'Gasolina', client_id: CID(1) }, ADMIN, AGORA);
    expect(b.id).toBe(a.id);
    expect(repo.ledger).toHaveLength(1);
    expect(repo.ledger[0]).toMatchObject({ created_by: ADMIN.id, created_by_name: 'Diego', reason: 'Gasolina' });
  });

  it('ajuste negativo não é desfeito pelo próximo fechamento (accrual ignora ajuste)', async () => {
    const { s, repo, inputs } = montar();
    inputs.set(A, '2026-10-26', { signups: 10 }); // semana corrente ainda aberta
    await s.ajustar({ consultant_id: A, amount_cents: -2500, reason: 'Cadastro duplicado', client_id: CID(1) }, ADMIN, AGORA);
    const proxSemana = new Date('2026-11-03T13:00:00.000Z');
    const r = await s.fechar({ week_start: SEMANA_ATUAL, consultant_id: A }, SIS, 'auto', proxSemana);
    expect(r.total_cents).toBe(10000 - 2500);
    const r2 = await s.fechar({ week_start: SEMANA_ATUAL, consultant_id: A }, SIS, 'auto', proxSemana);
    expect(r2).toMatchObject({ already_closed: 1, total_cents: 7500 });
    expect(repo.ledger.filter((l) => l.kind === 'accrual').reduce((a, l) => a + l.amount_cents, 0)).toBe(10000);
  });

  it('estorno referencia o original, inverte o valor, exige motivo e só acontece uma vez', async () => {
    const { s, repo } = montar();
    const aj = await s.ajustar({ consultant_id: A, amount_cents: 3000, reason: 'Bônus', client_id: CID(1) }, ADMIN, AGORA);
    await expect(s.estornar(aj.id, { reason: ' ', client_id: CID(2) }, ADMIN, AGORA)).rejects.toMatchObject({ response: { code: 'VALIDATION_ERROR' } });
    const es = await s.estornar(aj.id, { reason: 'Lançado por engano', client_id: CID(2) }, ADMIN, AGORA);
    expect(es).toMatchObject({ kind: 'reversal', amount_cents: -3000, reverses_id: aj.id, reason: 'Lançado por engano' });
    expect(repo.ledger.reduce((a, l) => a + l.amount_cents, 0)).toBe(0);
    // repetir a mesma chamada é idempotente; outra tentativa é 409
    const de_novo = await s.estornar(aj.id, { reason: 'Lançado por engano', client_id: CID(2) }, ADMIN, AGORA);
    expect(de_novo.id).toBe(es.id);
    await expect(s.estornar(aj.id, { reason: 'De novo', client_id: CID(3) }, ADMIN, AGORA)).rejects.toMatchObject({ response: { code: 'ALREADY_REVERSED' } });
    expect(repo.ledger).toHaveLength(2);
  });

  it('só ajuste é estornável: ganho calculado e estorno dão 422; id desconhecido 404', async () => {
    const { s, repo, inputs } = montar();
    inputs.set(A, '2026-10-19', { signups: 4 });
    await s.fechar({ week_start: SEMANA_ANT, consultant_id: A }, SIS, 'auto', AGORA);
    const accrual = repo.ledger[0]!;
    await expect(s.estornar(accrual.id, { reason: 'quero desfazer', client_id: CID(4) }, ADMIN, AGORA)).rejects.toMatchObject({ response: { code: 'NOT_REVERSIBLE' } });
    const aj = await s.ajustar({ consultant_id: A, amount_cents: 100, reason: 'teste', client_id: CID(5) }, ADMIN, AGORA);
    const es = await s.estornar(aj.id, { reason: 'desfaz teste', client_id: CID(6) }, ADMIN, AGORA);
    await expect(s.estornar(es.id, { reason: 'estorno do estorno', client_id: CID(7) }, ADMIN, AGORA)).rejects.toMatchObject({ response: { code: 'NOT_REVERSIBLE' } });
    await expect(s.estornar(CID(99), { reason: 'não existe', client_id: CID(8) }, ADMIN, AGORA)).rejects.toMatchObject({ response: { code: 'NOT_FOUND' } });
  });

  it('o ajuste aparece na semana corrente: extras e total', async () => {
    const { s } = montar();
    await s.ajustar({ consultant_id: A, amount_cents: 2000, reason: 'Ajuda de custo', client_id: CID(1) }, ADMIN, AGORA);
    const r = await s.equipe({ consultant_id: A }, AGORA);
    expect(r.consultants[0]).toMatchObject({ total_cents: 2000, extras_cents: 2000 });
    expect(r.consultants[0]?.conta).toContain('Ajustes e confirmações tardias que entram nesta semana: R$ 20,00.');
    expect(r.ledger).toHaveLength(1);
  });
});

describe('regra versionada', () => {
  const cfg = (o: Record<string, unknown> = {}) => ({ ...REGRA_PADRAO, ...o });

  it('PUT cria nova versão (nunca edita), com autoria e motivo', async () => {
    const { s, repo } = montar();
    const v = await s.salvarConfig({ valid_from: '2026-11-02', reason: 'Novo valor', config: cfg({ unit_cents: 1500 }) }, ADMIN, AGORA);
    expect(v).toMatchObject({ version: 2, valid_from: '2026-11-02', reason: 'Novo valor', created_by: 'Diego' });
    expect(repo.versions).toHaveLength(2);
    expect(repo.versions[0]?.config.unit_cents).toBe(1000); // a antiga continua intacta
    const c = await s.lerConfig(AGORA);
    expect(c.current.version).toBe(1);
    expect(c.upcoming.map((x) => x.version)).toEqual([2]);
    expect(c.default_config).toEqual(REGRA_PADRAO);
  });

  it('validação rígida: chave desconhecida, float e passado dão 400 com a mensagem do campo', async () => {
    const { s, repo } = montar();
    await expect(s.salvarConfig({ valid_from: '2026-11-02', config: { ...cfg(), bonus: 1 } }, ADMIN, AGORA)).rejects.toMatchObject({ response: { code: 'VALIDATION_ERROR', message: 'bonus: campo desconhecido.' } });
    await expect(s.salvarConfig({ valid_from: '2026-11-02', config: cfg({ unit_cents: 10.5 }) }, ADMIN, AGORA)).rejects.toMatchObject({ response: { code: 'VALIDATION_ERROR' } });
    await expect(s.salvarConfig({ valid_from: '2026-10-26', config: cfg() }, ADMIN, AGORA)).rejects.toMatchObject({ response: { code: 'VALIDATION_ERROR' } });
    expect(repo.versions).toHaveLength(1);
  });

  it('mudar o início da semana depois de haver razão dá 409 WEEK_START_LOCKED', async () => {
    const { s } = montar();
    await s.ajustar({ consultant_id: A, amount_cents: 100, reason: 'qualquer', client_id: CID(1) }, ADMIN, AGORA);
    await expect(s.salvarConfig({ valid_from: '2026-11-02', config: cfg({ week_start_weekday: 0 }) }, ADMIN, AGORA)).rejects.toMatchObject({ response: { code: 'WEEK_START_LOCKED' } });
  });

  it('mudar a regra não reescreve semana fechada nem o que já foi lançado', async () => {
    const { s, repo, inputs } = montar();
    inputs.set(A, '2026-10-19', { signups: 10 });
    await s.fechar({ week_start: SEMANA_ANT, consultant_id: A }, SIS, 'auto', AGORA);
    await s.salvarConfig({ valid_from: '2026-10-27', config: cfg({ unit_cents: 5000, tiers: [] }) }, ADMIN, AGORA);
    const r = await s.reconciliar({}, SIS, AGORA);
    expect(r.posted).toBe(0);
    expect(repo.periods[0]?.total_cents).toBe(10000);
    const v = await s.equipe({ week: SEMANA_ANT, consultant_id: A }, AGORA);
    expect(v.consultants[0]?.total_cents).toBe(10000);
  });

  it('virada no meio da semana: cada dia com a sua versão no fechamento', async () => {
    const { s, repo, inputs } = montar();
    await s.salvarConfig({ valid_from: '2026-10-29', config: cfg({ unit_cents: 2000, tiers: [] }) }, ADMIN, AGORA);
    inputs.set(A, '2026-10-28', { signups: 10 });
    inputs.set(A, '2026-10-29', { signups: 10 });
    const proxSemana = new Date('2026-11-03T13:00:00.000Z');
    await s.fechar({ week_start: SEMANA_ATUAL, consultant_id: A }, SIS, 'auto', proxSemana);
    const por = Object.fromEntries(repo.ledger.map((l) => [l.work_day, [l.amount_cents, l.rule_version]]));
    expect(por['2026-10-28']).toEqual([10000, 1]);
    expect(por['2026-10-29']).toEqual([20000, 2]);
  });

  it('faixa semanal gera lançamento próprio (escopo week) com o resto da semana', async () => {
    const { s, repo, inputs } = montar();
    await s.salvarConfig({ valid_from: '2026-11-02', config: cfg({ tiers_period: 'week', tiers: [{ min_signups: 20, amount_cents: 25000 }] }) }, ADMIN, AGORA);
    inputs.set(A, '2026-11-02', { signups: 8 });
    inputs.set(A, '2026-11-03', { signups: 12 });
    const depois = new Date('2026-11-10T13:00:00.000Z');
    const r = await s.fechar({ week_start: '2026-11-02', consultant_id: A }, SIS, 'auto', depois);
    expect(r.total_cents).toBe(25000);
    const semanal = repo.ledger.find((l) => l.work_scope === 'week');
    expect(semanal).toMatchObject({ work_day: null, amount_cents: 5000, work_week: '2026-11-02' });
  });

  it('simulador usa a mesma função e a conta escrita; não grava nada', async () => {
    const { s, repo } = montar();
    const r = await s.simular({ signups_confirmed: 12 }, AGORA);
    expect(r.day.total_cents).toBe(12000);
    expect(r.day.conta[0]).toBe('12 cadastros confirmados × R$ 10,00 = R$ 120,00.');
    const outro = await s.simular({ signups_confirmed: 12, config: cfg({ unit_cents: 500 }) }, AGORA);
    expect(outro.day.total_cents).toBe(10000);
    await expect(s.simular({ signups_confirmed: 1, config: cfg({ unit_cents: 1.5 }) }, AGORA)).rejects.toMatchObject({ response: { code: 'VALIDATION_ERROR' } });
    expect(repo.ledger).toHaveLength(0);
  });
});

describe('visão do consultor (GET /v1/campo/earnings)', () => {
  const eu = { id: A, name: 'Ana', email: 'ana@x.com', praca_id: PRACA_1, must_change_password: false };

  it('hoje, semana, não confirmados, Pix com data absoluta e a conta escrita', async () => {
    const { s, inputs } = montar();
    inputs.set(A, '2026-10-26', { signups: 3 });
    inputs.set(A, '2026-10-27', { signups: 12 });
    inputs.naoConf.set(A, 2);
    const r = await s.doConsultor(eu, AGORA);
    expect(r.today).toMatchObject({ day: '2026-10-27', total_cents: 12000, confirmed_signups: 12 });
    expect(r.today.conta[0]).toBe('12 cadastros confirmados × R$ 10,00 = R$ 120,00.');
    expect(r.week).toMatchObject({ from: '2026-10-26', to: '2026-11-01', total_cents: 15000 });
    expect(r.week.days).toHaveLength(7);
    expect(r.week.conta).toContain('ter 27/10: R$ 120,00 (12 cadastros confirmados).');
    expect(r.unconfirmed).toEqual({ count: 2, text: '2 cadastros ainda não confirmados pelo Freela: não entram na conta e passam a valer no dia em que o Freela confirmar.' });
    expect(r.pix).toEqual({ date: '2026-11-02', week_to: '2026-11-01', text: 'Pix previsto para 02/11/2026, referente a 26/10 a 01/11.' });
    expect(r.rule_version).toBe(1);
    expect(r.previous_weeks).toHaveLength(4);
    expect(r.previous_weeks[0]).toMatchObject({ from: '2026-10-19', status: 'open', total_cents: 0 });
  });

  it('isolamento: só os dados do consultor autenticado entram na resposta', async () => {
    const { s, inputs } = montar();
    inputs.set(A, '2026-10-27', { signups: 1 });
    inputs.set(B, '2026-10-27', { signups: 30 });
    const r = await s.doConsultor(eu, AGORA);
    expect(r.today.total_cents).toBe(1000);
    expect(inputs.chamadas.dias.every((ids) => ids.length === 1 && ids[0] === A)).toBe(true);
    expect(JSON.stringify(r)).not.toContain('Beto');
  });

  it('o ajuste do admin aparece na semana do consultor; Pix e chave nunca saem na resposta', async () => {
    const { s } = montar();
    await s.ajustar({ consultant_id: A, amount_cents: 1000, reason: 'Ajuda', client_id: CID(1) }, ADMIN, AGORA);
    const r = await s.doConsultor(eu, AGORA);
    expect(r.week.total_cents).toBe(1000);
    expect(Object.keys(r)).not.toContain('pix_key');
    expect(JSON.stringify(r)).not.toMatch(/pix_key/);
  });
});

describe('piso por diária (a condição vem da jornada/visitas)', () => {
  it('piso com jornada aberta: dia sem cadastro paga o piso só se houve jornada', async () => {
    const { s, repo, inputs } = montar();
    await s.salvarConfig({ valid_from: '2026-10-27', config: { ...REGRA_PADRAO, floor_cents: 5000, floor_condition: 'journey_open' } }, ADMIN, AGORA);
    inputs.set(A, '2026-10-27', { journey: true });
    inputs.set(A, '2026-10-28', {});
    const r = await s.fechar({ week_start: SEMANA_ATUAL, consultant_id: A }, SIS, 'auto', new Date('2026-11-03T13:00:00.000Z'));
    expect(r.total_cents).toBe(5000);
    expect(repo.ledger.map((l) => l.work_day)).toEqual(['2026-10-27']);
  });

  it('visitas contadas no check-out quando a regra pede', async () => {
    const { s, inputs } = montar();
    await s.salvarConfig({ valid_from: '2026-10-27', config: { ...REGRA_PADRAO, floor_cents: 10000, floor_condition: 'min_visits', floor_min_visits: 5, visits_count: 'checkout' } }, ADMIN, AGORA);
    inputs.set(A, '2026-10-27', { visits_checkin: 8, visits_checkout: 4 });
    const r = await s.doConsultor({ id: A, name: 'Ana', email: 'a@x', praca_id: PRACA_1, must_change_password: false }, AGORA);
    expect(r.today.total_cents).toBe(0);
    expect(r.today.conta).toContain('Piso do dia de R$ 100,00 não vale: foram 4 visitas e o mínimo é 5.');
  });
});

describe('fechamento automático', () => {
  it('só fecha no dia do Pix e depois da hora configurada (Brasília)', async () => {
    const { s } = montar();
    expect(await s.deveFecharAgora(new Date('2026-10-26T08:59:00.000Z'))).toBe(false); // segunda 05:59 BRT
    expect(await s.deveFecharAgora(new Date('2026-10-26T09:00:00.000Z'))).toBe(true); // segunda 06:00 BRT
    expect(await s.deveFecharAgora(new Date('2026-10-27T13:00:00.000Z'))).toBe(false); // terça
  });

  it('na primeira vez fecha só a última semana encerrada (não inventa histórico)', async () => {
    const { s, repo } = montar();
    const segunda = new Date('2026-10-26T10:00:00.000Z');
    const r = await s.fecharEncerradas(segunda);
    expect(r.semanas).toBe(1);
    expect([...new Set(repo.periods.map((p) => p.week_start))]).toEqual(['2026-10-19']);
  });

  it('depois que há fechamento, recupera as semanas encerradas que ficaram abertas', async () => {
    const { s, repo } = montar();
    await s.fecharEncerradas(new Date('2026-10-26T10:00:00.000Z'));
    const duasSemanasDepois = new Date('2026-11-09T10:00:00.000Z'); // o job não rodou em 02/11
    await s.fecharEncerradas(duasSemanasDepois);
    expect([...new Set(repo.periods.map((p) => p.week_start))].sort()).toEqual(['2026-10-19', '2026-10-26', '2026-11-02']);
  });
});
