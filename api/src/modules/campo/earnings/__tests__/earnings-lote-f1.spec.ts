/**
 * Lote F1 no serviço de remuneração: L11 bônus mensal (contrato §43) e L13 regra de pagamento por consultor (§45).
 * O comportamento de antes fica congelado em `earnings-servico-caracterizacao.spec.ts`; aqui, além do novo, a prova de que
 * flag ligada sem uso (sem regra mensal, sem regra própria) dá o MESMO resultado byte a byte.
 */
import type { AuthUser } from '../../../../common/auth/auth-user';
import { PERMISSAO_KEY } from '../../../../common/decorators/admin-only.decorator';
import { REGRA_PADRAO, type RegraBruta } from '../../../../domain/earnings-rules';
import type { RotasConfigService } from '../../../rotas/rotas-config.service';
import { EarningsEquipeController } from '../earnings.controller';
import { PorConsultorLigadoGuard } from '../earnings.guard';
import { EarningsService } from '../earnings.service';
import type { OpcoesEarnings } from '../earnings.tokens';
import { A, AGORA, B, FakeInputs, FakeRepo } from './fakes';

const ADMIN: AuthUser = { id: 'dddddddd-0000-4000-8000-000000000001', email: 'a@x.com', name: 'Diego', is_admin: true };
const ATOR = { id: ADMIN.id, name: ADMIN.name };
/** Segunda 02/11/2026, 07:00 em Brasília: dia do Pix da semana 26/10–01/11 (que contém 31/10). */
const SEGUNDA_PIX = new Date('2026-11-02T10:00:00.000Z');
const TERCA_DEPOIS = new Date('2026-11-03T13:00:00.000Z');
const MENSAL: RegraBruta & Record<string, unknown> = {
  ...REGRA_PADRAO,
  tiers_period: 'month',
  combine: 'sum',
  tiers: [
    { min_signups: 20, amount_cents: 15000 },
    { min_signups: 40, amount_cents: 30000 },
  ],
};
const PROPRIA: RegraBruta & Record<string, unknown> = { ...REGRA_PADRAO, unit_cents: 2000, tiers: [] };

function montar(o: Partial<OpcoesEarnings> = {}) {
  const repo = new FakeRepo();
  const inputs = new FakeInputs();
  const config = { cadastro: async () => ({ confirmation_rule: 'activated' as const }) } as unknown as RotasConfigService;
  const s = new EarningsService(repo, inputs, config, { ligado: true, autoClose: false, janelaNaoConfirmadosDias: 45, ...o });
  return { s, repo, inputs };
}
/** Versão gravada direto (o PUT não aceita `valid_from` no passado): como se tivesse sido publicada antes. */
function versao(repo: FakeRepo, valid_from: string, config: RegraBruta, consultant_id?: string) {
  repo.versions.push({
    version: repo.versions.length + 1,
    valid_from,
    config,
    reason: 'teste',
    created_by_name: 'Diego',
    created_at: new Date('2026-10-01T00:00:00.000Z'),
    ...(consultant_id ? { consultant_id } : {}),
  });
  return repo.versions.length;
}
/** Outubro de 2026 com 42 cadastros de A em 5 semanas (e um dia de setembro e um de novembro que não contam). */
function outubro(inputs: FakeInputs, extra = 0) {
  const n: Array<[string, number]> = [
    ['2026-09-30', 50],
    ['2026-10-01', 5],
    ['2026-10-02', 3],
    ['2026-10-08', 7],
    ['2026-10-15', 6 + extra],
    ['2026-10-21', 9],
    ['2026-10-28', 8],
    ['2026-10-31', 4],
    ['2026-11-01', 50],
  ];
  for (const [d, s] of n) inputs.set(A, d, { signups: s, visits_checkin: s, journey: true });
}
const linha = async (s: EarningsService, semana: string, agora: Date, id = A) =>
  (await s.equipe({ week: semana }, agora)).consultants.find((c) => c.consultant_id === id)!;
const semIds = (x: unknown) => JSON.parse(JSON.stringify(x, (k, v) => (k === 'id' || k === 'created_at' ? '<x>' : v)));

describe('L11 — PUT e simulador com o bônus mensal', () => {
  it('flag desligada: month = 409 MONTHLY_DISABLED (PUT e simulador); outro valor inválido = 400 de sempre', async () => {
    const { s } = montar();
    await expect(s.salvarConfig({ valid_from: '2026-11-01', config: MENSAL }, ADMIN, AGORA)).rejects.toMatchObject({ status: 409, response: { code: 'MONTHLY_DISABLED' } });
    await expect(s.simular({ signups_confirmed: 1, config: MENSAL }, AGORA)).rejects.toMatchObject({ status: 409, response: { code: 'MONTHLY_DISABLED' } });
    await expect(s.salvarConfig({ valid_from: '2026-11-01', config: { ...REGRA_PADRAO, tiers_period: 'ano' } }, ADMIN, AGORA)).rejects.toMatchObject({
      status: 400,
      response: { code: 'VALIDATION_ERROR', message: 'tiers_period: use day ou week.' },
    });
  });
  it('flag ligada: grava no dia 1; recusa max, teto e início fora do dia 1', async () => {
    const { s, repo } = montar({ mensalLigado: true });
    const v = await s.salvarConfig({ valid_from: '2026-11-01', config: MENSAL }, ADMIN, AGORA);
    expect(v.config).toEqual(MENSAL);
    expect(repo.versions).toHaveLength(2);
    await expect(s.salvarConfig({ valid_from: '2026-11-01', config: { ...MENSAL, combine: 'max' } }, ADMIN, AGORA)).rejects.toMatchObject({ response: { message: expect.stringMatching(/^combine:/) } });
    await expect(s.salvarConfig({ valid_from: '2026-11-01', config: { ...MENSAL, cap_cents: 9000 } }, ADMIN, AGORA)).rejects.toMatchObject({ response: { message: expect.stringMatching(/^cap_cents:/) } });
    await expect(s.salvarConfig({ valid_from: '2026-11-02', config: MENSAL }, ADMIN, AGORA)).rejects.toMatchObject({ response: { message: expect.stringContaining('dia 1') } });
    expect((await s.lerConfig(AGORA)).features).toMatchObject({ monthly_enabled: true });
  });
  it('simulador: "Simular o mês" pela mesma função (42 cadastros → faixa 40 = R$ 300,00)', async () => {
    const { s } = montar({ mensalLigado: true });
    const r = await s.simular({ signups_confirmed: 3, config: MENSAL, month_signups: 42 }, AGORA);
    expect(r.month?.total_cents).toBe(30000);
    expect(r.day.total_cents).toBe(3000);
    expect(r.month?.conta.join(' ')).toContain('Faixa do mês atingida: 40 cadastros = R$ 300,00.');
    expect(r.month?.conta.join(' ')).toContain('(regra em edição, não salva)');
    expect(r.month?.conta.join(' ')).not.toContain('versão 0');
    // sem regra mensal, month_signups é ignorado
    expect('month' in (await s.simular({ signups_confirmed: 3, month_signups: 42 }, AGORA))).toBe(false);
  });
});

describe('L11 — mês que atravessa semanas, razão, idempotência e Pix', () => {
  it('a semana 26/10–01/11 leva o bônus de outubro (conta só os dias do mês) e a projeção diz o Pix', async () => {
    const { s, repo, inputs } = montar({ mensalLigado: true });
    versao(repo, '2026-10-01', MENSAL);
    outubro(inputs);
    const l = await linha(s, '2026-10-26', SEGUNDA_PIX);
    expect(l.month).toMatchObject({ month: '2026-10', signups: 42, amount_cents: 30000, ended: true, work_week: '2026-10-26', pix_date: '2026-11-02', pix_label: 'seg 02/11' });
    expect(l.month?.text).toBe('Meta de outubro: 42 cadastros confirmados → faixa 40 = R$ 300,00, entra no Pix de seg 02/11.');
    expect(l.month_part_cents).toBe(30000);
    expect(l.total_cents).toBe((8 + 4 + 50) * 1000 + 30000);
    expect(l.conta.join(' ')).toContain('Bônus do mês de outubro: R$ 300,00');
    // as outras semanas de outubro não levam o bônus
    expect('month' in (await linha(s, '2026-10-19', SEGUNDA_PIX))).toBe(false);
  });
  it('fechar a semana do fim do mês lança acc:month:2026-10:1; repetir não duplica', async () => {
    const { s, repo, inputs } = montar({ mensalLigado: true });
    const vm = versao(repo, '2026-10-01', MENSAL);
    outubro(inputs);
    await s.fechar({ week_start: '2026-10-26' }, ATOR, 'manual', SEGUNDA_PIX);
    const mes = repo.ledger.filter((l) => l.work_scope === 'month');
    expect(mes).toHaveLength(1);
    expect(mes[0]).toMatchObject({
      kind: 'accrual',
      amount_cents: 30000,
      work_day: '2026-10-01',
      work_week: '2026-10-26',
      payout_week: '2026-10-26',
      idempotency_key: 'acc:month:2026-10:1',
      rule_version: vm,
      source: 'weekly_close',
    });
    expect(mes[0]!.snapshot).toMatchObject({ scope: 'month', inputs: { month: '2026-10', signups_month: 42 }, rule: MENSAL });
    expect(repo.periods[0]?.total_cents).toBe((8 + 4 + 50) * 1000 + 30000);
    const antes = repo.ledger.length;
    expect((await s.fechar({ week_start: '2026-10-26' }, ATOR, 'manual', SEGUNDA_PIX)).already_closed).toBe(2); // A e B
    expect(await s.reconciliar({}, ATOR, SEGUNDA_PIX)).toEqual({ posted: 0, total_cents: 0 });
    expect(repo.ledger).toHaveLength(antes);
  });
  it('confirmação tardia dentro do prazo vira delta do mês na 1ª semana aberta (acc:month:2026-10:2); de novo não duplica', async () => {
    const { s, repo, inputs } = montar({ mensalLigado: true });
    versao(repo, '2026-10-01', MENSAL);
    outubro(inputs, -3); // 39 cadastros: faixa 20 = R$ 150,00
    await s.fechar({ week_start: '2026-10-26' }, ATOR, 'manual', SEGUNDA_PIX);
    expect(repo.ledger.find((l) => l.work_scope === 'month')?.amount_cents).toBe(15000);
    outubro(inputs, -2); // chegou a 40ª (dia 15/10, semana 12/10 nunca fechada): +R$ 150,00 no mês
    const semana = await linha(s, '2026-11-02', TERCA_DEPOIS);
    expect(semana.extras_cents).toBe(15000);
    expect(await s.reconciliar({}, ATOR, TERCA_DEPOIS)).toEqual({ posted: 1, total_cents: 15000 });
    const tardio = repo.ledger.filter((l) => l.work_scope === 'month').find((l) => l.idempotency_key === 'acc:month:2026-10:2');
    expect(tardio).toMatchObject({ amount_cents: 15000, work_week: '2026-10-26', payout_week: '2026-11-02', source: 'late_confirmation' });
    expect(await s.reconciliar({}, ATOR, TERCA_DEPOIS)).toEqual({ posted: 0, total_cents: 0 });
    // o dia 15/10 continua da semana 12/10 (aberta): não vira tardio
    expect(repo.ledger.filter((l) => l.work_day === '2026-10-15')).toHaveLength(0);
  });
  it('fechamento automático (flag de autoclose ligada) leva o bônus do mês e a 2ª rodada não faz nada', async () => {
    const { s, repo, inputs } = montar({ mensalLigado: true, autoClose: true });
    versao(repo, '2026-10-01', MENSAL);
    outubro(inputs);
    expect(await s.deveFecharAgora(SEGUNDA_PIX)).toBe(true);
    const r = await s.fecharEncerradas(SEGUNDA_PIX);
    expect(r.fechados).toBe(2); // A e B (B sem movimento fecha em R$ 0)
    expect(repo.ledger.filter((l) => l.idempotency_key === 'acc:month:2026-10:1')).toHaveLength(1);
    const n = repo.ledger.length;
    await s.fecharEncerradas(SEGUNDA_PIX);
    expect(repo.ledger).toHaveLength(n);
  });
  it('virada do mês no fuso de Brasília: 01/11 01:00Z ainda é 31/10 (mês em andamento); 03:30Z já é 01/11 (encerrado)', async () => {
    const { s, repo, inputs } = montar({ mensalLigado: true });
    versao(repo, '2026-10-01', MENSAL);
    outubro(inputs);
    const antes = await linha(s, '2026-10-26', new Date('2026-11-01T01:00:00.000Z'));
    expect(antes.month).toMatchObject({ ended: false, signups: 42 });
    expect(antes.month?.text).toBe('Meta do mês (outubro): 42 cadastros confirmados → faixa 40 = R$ 300,00 até agora (Pix de seg 02/11).');
    const depois = await linha(s, '2026-10-26', new Date('2026-11-01T03:30:00.000Z'));
    expect(depois.month).toMatchObject({ ended: true, signups: 42 });
    const proj = await s.doConsultor({ id: A } as never, new Date('2026-11-01T01:00:00.000Z'));
    expect(proj.month).toMatchObject({ month: '2026-10', ended: false });
    const nov = await s.doConsultor({ id: A } as never, new Date('2026-11-01T03:30:00.000Z'));
    expect(nov.month).toMatchObject({ month: '2026-11', signups: 50, amount_cents: 30000 });
  });
  it('projeção do consultor no meio do mês: "28 de 40… Faltam 12 para R$ 300,00"', async () => {
    const { s, repo, inputs } = montar({ mensalLigado: true });
    versao(repo, '2026-10-01', { ...MENSAL, tiers: [{ min_signups: 40, amount_cents: 30000 }] });
    inputs.set(A, '2026-10-05', { signups: 20 });
    inputs.set(A, '2026-10-26', { signups: 8 });
    const r = await s.doConsultor({ id: A } as never, AGORA);
    expect(r.month?.text).toBe('Meta do mês (outubro): 28 de 40 cadastros confirmados. Faltam 12 para R$ 300,00 (Pix de seg 02/11).');
  });
  it('desligar a flag não reescreve o passado: a versão mensal publicada continua valendo no cálculo', async () => {
    const { s, repo, inputs } = montar({ mensalLigado: false });
    versao(repo, '2026-10-01', MENSAL);
    outubro(inputs);
    expect((await linha(s, '2026-10-26', SEGUNDA_PIX)).month_part_cents).toBe(30000);
  });
  it('flag ligada sem regra mensal = byte a byte o de hoje (extrato, consultor, fechamento e razão)', async () => {
    const a = montar();
    const b = montar({ mensalLigado: true, porConsultorLigado: true });
    for (const m of [a, b]) outubro(m.inputs);
    expect(semIds(await b.s.equipe({ week: '2026-10-26' }, SEGUNDA_PIX))).toEqual(semIds(await a.s.equipe({ week: '2026-10-26' }, SEGUNDA_PIX)));
    expect(semIds(await b.s.doConsultor({ id: A } as never, SEGUNDA_PIX))).toEqual(semIds(await a.s.doConsultor({ id: A } as never, SEGUNDA_PIX)));
    await a.s.fechar({ week_start: '2026-10-26' }, ATOR, 'manual', SEGUNDA_PIX);
    await b.s.fechar({ week_start: '2026-10-26' }, ATOR, 'manual', SEGUNDA_PIX);
    expect(semIds(b.repo.ledger)).toEqual(semIds(a.repo.ledger));
    expect(semIds(b.repo.periods)).toEqual(semIds(a.repo.periods));
    expect(semIds(await b.s.lerConfig(AGORA))).toEqual({ ...semIds(await a.s.lerConfig(AGORA)), features: { ...semIds(await a.s.lerConfig(AGORA)).features, monthly_enabled: true, per_consultant_enabled: true } });
  });
});

describe('L13 — regra de pagamento por consultor', () => {
  const dados = (inputs: FakeInputs) => {
    for (const d of ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22']) {
      inputs.set(A, d, { signups: 3, visits_checkin: 3, journey: true });
      inputs.set(B, d, { signups: 3, visits_checkin: 3, journey: true });
    }
  };
  it('flag desligada: nenhuma consulta às regras próprias e uma versão de consultor no banco é ignorada', async () => {
    const limpo = montar();
    const comVersao = montar();
    versao(comVersao.repo, '2026-10-21', PROPRIA, A);
    for (const m of [limpo, comVersao]) dados(m.inputs);
    expect(semIds(await comVersao.s.equipe({ week: '2026-10-19' }, AGORA))).toEqual(semIds(await limpo.s.equipe({ week: '2026-10-19' }, AGORA)));
    await comVersao.s.doConsultor({ id: A } as never, AGORA);
    await comVersao.s.fechar({ week_start: '2026-10-19' }, ATOR, 'manual', AGORA);
    await comVersao.s.reconciliar({}, ATOR, AGORA);
    expect(comVersao.repo.ledger.every((l) => l.rule_version === 1)).toBe(true);
    expect(comVersao.repo.chamadasProprias).toBe(0);
    await expect(comVersao.s.simular({ signups_confirmed: 1, consultant_id: A }, AGORA)).rejects.toMatchObject({ status: 422, response: { code: 'PER_CONSULTANT_DISABLED' } });
    expect((await comVersao.s.simular({ signups_confirmed: 1, consultant_id: null }, AGORA)).day.total_cents).toBe(1000);
  });
  it('consultor sem regra própria (flag ligada) = byte a byte o de hoje', async () => {
    const a = montar();
    const b = montar({ porConsultorLigado: true });
    versao(b.repo, '2026-10-21', PROPRIA, A); // só A tem; B fica idêntico
    for (const m of [a, b]) dados(m.inputs);
    const la = (await a.s.equipe({ week: '2026-10-19' }, AGORA)).consultants.find((c) => c.consultant_id === B);
    const lb = (await b.s.equipe({ week: '2026-10-19' }, AGORA)).consultants.find((c) => c.consultant_id === B);
    expect(semIds(lb)).toEqual(semIds(la));
    expect(semIds(await b.s.doConsultor({ id: B } as never, AGORA))).toEqual(semIds(await a.s.doConsultor({ id: B } as never, AGORA)));
    await a.s.fechar({ week_start: '2026-10-19', consultant_id: B }, ATOR, 'manual', AGORA);
    await b.s.fechar({ week_start: '2026-10-19', consultant_id: B }, ATOR, 'manual', AGORA);
    expect(semIds(b.repo.ledger)).toEqual(semIds(a.repo.ledger));
  });
  it('troca de regra no meio da semana: 19–20 pela geral, 21 em diante pela do consultor; diz qual valeu; B isolado', async () => {
    const { s, repo, inputs } = montar({ porConsultorLigado: true });
    const vp = versao(repo, '2026-10-21', PROPRIA, A);
    dados(inputs);
    const ex = await s.equipe({ week: '2026-10-19' }, AGORA);
    const la = ex.consultants.find((c) => c.consultant_id === A)!;
    const lb = ex.consultants.find((c) => c.consultant_id === B)!;
    expect(la.days.slice(0, 4).map((d) => [d.rule_version, d.total_cents])).toEqual([
      [1, 3000],
      [1, 3000],
      [vp, 6000],
      [vp, 6000],
    ]);
    expect(la.total_cents).toBe(18000);
    expect(lb.total_cents).toBe(12000);
    expect(la.rule).toMatchObject({ scope: 'consultant', version: vp, label: `Regra própria de Ana · versão ${vp}` });
    expect('rule' in lb).toBe(false);
    expect(la.days[2]).toMatchObject({ rule_scope: 'consultant' });
    expect('rule_scope' in la.days[0]!).toBe(false);
    expect(la.days[2]!.conta[0]).toBe(`Regra própria de Ana · versão ${vp}.`);
    expect(la.conta[0]).toBe(`Regras desta semana: Regra geral · versão 1 (19/10 a 20/10); Regra própria de Ana · versão ${vp} (21/10 a 25/10).`);
    await s.fechar({ week_start: '2026-10-19' }, ATOR, 'manual', AGORA);
    const dia21 = repo.ledger.find((l) => l.consultant_id === A && l.work_day === '2026-10-21')!;
    expect(dia21).toMatchObject({ amount_cents: 6000, rule_version: vp });
    expect(dia21.snapshot).toMatchObject({ rule: PROPRIA, rule_scope: 'consultant' });
    expect('rule_scope' in repo.ledger.find((l) => l.consultant_id === A && l.work_day === '2026-10-19')!.snapshot).toBe(false);
    expect(repo.periods.find((p) => p.consultant_id === A)?.rule_version).toBe(1);
  });
  it('regra geral nova não alcança quem tem regra própria; o consultor vê a regra dele', async () => {
    const { s, repo, inputs } = montar({ porConsultorLigado: true });
    const vp = versao(repo, '2026-10-19', PROPRIA, A);
    versao(repo, '2026-10-26', { ...REGRA_PADRAO, unit_cents: 5000 });
    inputs.set(A, '2026-10-27', { signups: 2 });
    inputs.set(B, '2026-10-27', { signups: 2 });
    const r = await s.doConsultor({ id: A } as never, AGORA);
    expect(r.today.total_cents).toBe(4000);
    expect(r.rule_version).toBe(vp);
    expect(r.rule).toMatchObject({ scope: 'consultant', label: `Regra própria de Ana · versão ${vp}` });
    const rb = await s.doConsultor({ id: B } as never, AGORA);
    expect(rb.today.total_cents).toBe(10000);
    expect('rule' in rb).toBe(false);
  });
  it('criar: semana aberta no passado vale; semana fechada = 409 WEEK_CLOSED; calendário da geral; mês só com a flag', async () => {
    const { s, repo } = montar({ porConsultorLigado: true });
    await s.fechar({ week_start: '2026-10-19', consultant_id: A }, ATOR, 'manual', AGORA);
    await expect(s.criarRegraDoConsultor({ consultant_id: A, valid_from: '2026-10-25', config: PROPRIA }, ADMIN, AGORA)).rejects.toMatchObject({ status: 409, response: { code: 'WEEK_CLOSED' } });
    await expect(s.criarRegraDoConsultor({ consultant_id: A, valid_from: '2026-10-26', config: { ...PROPRIA, payout_weekday: 5 } }, ADMIN, AGORA)).rejects.toMatchObject({
      status: 400,
      response: { message: expect.stringMatching(/^payout_weekday:/) },
    });
    await expect(s.criarRegraDoConsultor({ consultant_id: A, valid_from: '2026-11-01', config: MENSAL }, ADMIN, AGORA)).rejects.toMatchObject({ status: 409, response: { code: 'MONTHLY_DISABLED' } });
    await expect(s.criarRegraDoConsultor({ consultant_id: 'nao-e-uuid', valid_from: '2026-10-26', config: PROPRIA }, ADMIN, AGORA)).rejects.toMatchObject({ status: 404 });
    await expect(s.criarRegraDoConsultor({ consultant_id: 'cccccccc-0000-4000-8000-000000000099', valid_from: '2026-10-26', config: PROPRIA }, ADMIN, AGORA)).rejects.toMatchObject({ status: 404 });
    // B não tem semana fechada: o passado aberto vale (não antes da semana em que foi criado)
    const vb = await s.criarRegraDoConsultor({ consultant_id: B, valid_from: '2026-10-19', reason: 'combinado', config: PROPRIA }, ADMIN, AGORA);
    expect(vb).toMatchObject({ consultant_id: B, valid_from: '2026-10-19', reason: 'combinado' });
    expect((await s.lerConfig(AGORA)).history.map((v) => v.version)).toEqual([1]);
    const va = await s.criarRegraDoConsultor({ consultant_id: A, valid_from: '2026-10-26', config: PROPRIA }, ADMIN, AGORA);
    const lida = await s.regrasDoConsultor(A, AGORA);
    expect(lida).toMatchObject({ consultant_id: A, current: { scope: 'consultant', version: va.version }, min_valid_from: '2026-10-26', global_current: { version: 1 } });
    expect(lida.own.map((v) => v.version)).toEqual([va.version]);
    expect(repo.versions.filter((v) => v.consultant_id)).toHaveLength(2);
  });
  it('a regra muda enquanto a semana é calculada: o fechamento responde 409 RULE_CHANGED (não fecha com a velha)', async () => {
    const { s, repo, inputs } = montar({ porConsultorLigado: true });
    dados(inputs);
    const real = repo.versoesDosConsultores.bind(repo);
    let n = 0;
    repo.versoesDosConsultores = async (ids: string[]) => {
      n++;
      if (n === 2) versao(repo, '2026-10-21', PROPRIA, A); // entre o cálculo e o lock
      return real(ids);
    };
    await expect(s.fechar({ week_start: '2026-10-19', consultant_id: A }, ATOR, 'manual', AGORA)).rejects.toMatchObject({ status: 409, response: { code: 'RULE_CHANGED' } });
    expect(repo.periods).toHaveLength(0);
    await s.fechar({ week_start: '2026-10-19', consultant_id: A }, ATOR, 'manual', AGORA);
    expect(repo.ledger.find((l) => l.work_day === '2026-10-21')?.amount_cents).toBe(6000);
  });
  it('simulador pela regra do consultor', async () => {
    const { s, repo } = montar({ porConsultorLigado: true });
    versao(repo, '2026-10-19', PROPRIA, A);
    const r = await s.simular({ signups_confirmed: 3, consultant_id: A }, AGORA);
    expect(r.day.total_cents).toBe(6000);
    expect(r.rule).toMatchObject({ scope: 'consultant' });
    expect((await s.simular({ signups_confirmed: 3, consultant_id: B }, AGORA)).rule).toMatchObject({ scope: 'global', label: 'Regra geral · versão 1' });
  });
  it('regra própria mensal do consultor (as duas flags): bônus do mês pela regra dele', async () => {
    const { s, repo, inputs } = montar({ porConsultorLigado: true, mensalLigado: true });
    versao(repo, '2026-10-01', MENSAL, A);
    outubro(inputs);
    const l = await linha(s, '2026-10-26', SEGUNDA_PIX);
    expect(l.month).toMatchObject({ amount_cents: 30000 });
    expect(l.month?.conta[0]).toMatch(/^Regra própria de Ana/);
    expect('month' in (await linha(s, '2026-10-26', SEGUNDA_PIX, B))).toBe(false);
  });
});

describe('L13 — rotas', () => {
  it('leitura e escrita da regra própria são só de admin (marca no método) e passam pela trava da flag', () => {
    for (const m of ['regrasDoConsultor', 'criarRegraDoConsultor'] as const) {
      const fn = EarningsEquipeController.prototype[m];
      expect(Reflect.getMetadata(PERMISSAO_KEY, fn)).toBe('admin');
      expect(Reflect.getMetadata('__guards__', fn)).toContain(PorConsultorLigadoGuard);
    }
  });
  it('flag desligada = 404 PER_CONSULTANT_DISABLED; ligada = passa', () => {
    expect(() => new PorConsultorLigadoGuard({ ligado: true, autoClose: false, janelaNaoConfirmadosDias: 45 }).canActivate()).toThrow(
      expect.objectContaining({ response: { code: 'PER_CONSULTANT_DISABLED', message: 'A regra de pagamento por consultor não está habilitada.' } }),
    );
    expect(new PorConsultorLigadoGuard({ ligado: true, autoClose: false, janelaNaoConfirmadosDias: 45, porConsultorLigado: true }).canActivate()).toBe(true);
  });
});
