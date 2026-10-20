/**
 * Modo do chefe S2/S3 no serviço de remuneração (contrato §32): PUT/GET da regra estendida, diária e metas do chefe,
 * declarações (limite, anulação no razão) e a garantia "flag desligada não reescreve o passado".
 */
import type { AuthUser } from '../../../../common/auth/auth-user';
import { PRESET_CHEFE, REGRA_PADRAO, type RegraBruta } from '../../../../domain/earnings-rules';
import type { RotasConfigService } from '../../../rotas/rotas-config.service';
import { EarningsService } from '../earnings.service';
import { A, AGORA, FakeInputs, FakeRepo } from './fakes';

const ADMIN: AuthUser = { id: 'dddddddd-0000-4000-8000-000000000001', email: 'a@x.com', name: 'Diego', is_admin: true };
const SEMANA_ANT = '2026-10-19';
const SEMANA_ATUAL = '2026-10-26';

function montar(opcoes: { rotas?: boolean; declaradas?: boolean } = {}) {
  const repo = new FakeRepo();
  const inputs = new FakeInputs();
  const config = { cadastro: async () => ({ confirmation_rule: 'activated' as const }) } as unknown as RotasConfigService;
  const s = new EarningsService(repo, inputs, config, {
    ligado: true,
    autoClose: false,
    janelaNaoConfirmadosDias: 45,
    rotasLigadas: opcoes.rotas ?? false,
    declaradasLigado: opcoes.declaradas ?? false,
  });
  return { s, repo, inputs };
}
const chefe = (o: Partial<RegraBruta> = {}): RegraBruta => ({ ...PRESET_CHEFE, ...o });
const vigente = (repo: FakeRepo, cfg: RegraBruta) => {
  (repo.versions[0] as { config: RegraBruta }).config = cfg;
};
const equipe = async (s: EarningsService, semana = SEMANA_ATUAL) => {
  const r = await s.equipe({ week: semana }, AGORA);
  return r.consultants.find((c) => c.consultant_id === A)!;
};

describe('PUT/GET da regra: o que o web atual manda continua valendo', () => {
  it('a config de 13 campos grava as MESMAS 13 chaves (nada injetado) e a resposta traz a versão efetiva', async () => {
    const { s, repo } = montar();
    const v = await s.salvarConfig({ valid_from: '2026-11-02', config: { ...REGRA_PADRAO, unit_cents: 1200 } }, ADMIN, AGORA);
    expect(Object.keys(repo.versions[1]!.config).sort()).toEqual(Object.keys(REGRA_PADRAO).sort());
    expect(v.config_effective).toMatchObject({ unit_cents: 1200, signup_source: 'freela_confirmed', daily_base_cents: 0, tiers_mode: 'highest' });
  });
  it('chaves novas nulas (eco do web) valem como ausentes; o eco da GET normalizada também é aceito', async () => {
    const { s, repo } = montar();
    const nulas = { signup_source: null, daily_base_cents: null, daily_base_condition: null, tiers_mode: null, declared_daily_cap: null };
    await s.salvarConfig({ valid_from: '2026-11-02', config: { ...REGRA_PADRAO, ...nulas } }, ADMIN, AGORA);
    expect(Object.keys(repo.versions[1]!.config)).toHaveLength(13);
    const g = await s.lerConfig(AGORA);
    await s.salvarConfig({ valid_from: '2026-11-03', config: g.current.config_effective as unknown as Record<string, unknown> }, ADMIN, AGORA);
    expect(repo.versions).toHaveLength(3);
  });
  it('GET: config crua, config_effective, presets e features; default_config e limits como antes', async () => {
    const { s } = montar({ rotas: true });
    const g = await s.lerConfig(AGORA);
    expect(g.current.config).toEqual(REGRA_PADRAO);
    expect(g.current.config_effective.signup_source).toBe('freela_confirmed');
    expect(g.default_config).toEqual(REGRA_PADRAO);
    expect(g.presets.chefe.signup_source).toBe('declared');
    expect(g.presets.completo).toMatchObject({ ...REGRA_PADRAO, tiers_mode: 'highest' });
    expect(g.features).toEqual({ routes_enabled: true, declared_signups_enabled: false });
    expect(g.extended.defaults.daily_base_requires_journey).toBe(true);
  });
  it('route_assigned com rotas desligadas = 409 ROUTES_DISABLED; declared sem a flag = 409 DECLARED_DISABLED', async () => {
    const { s, repo } = montar();
    await expect(
      s.salvarConfig({ valid_from: '2026-11-02', config: { ...REGRA_PADRAO, daily_base_cents: 100, daily_base_condition: 'route_assigned' } }, ADMIN, AGORA),
    ).rejects.toMatchObject({ response: { code: 'ROUTES_DISABLED' } });
    await expect(
      s.salvarConfig({ valid_from: '2026-11-02', config: { ...REGRA_PADRAO, signup_source: 'declared' } }, ADMIN, AGORA),
    ).rejects.toMatchObject({ response: { code: 'DECLARED_DISABLED' } });
    expect(repo.versions).toHaveLength(1);
  });
  it('com as flags ligadas a regra do chefe é aceita (valid_from no 1º dia da semana por causa das metas semanais)', async () => {
    const { s, repo } = montar({ rotas: true, declaradas: true });
    await s.salvarConfig({ valid_from: '2026-11-02', config: { ...PRESET_CHEFE } }, ADMIN, AGORA);
    expect(repo.versions[1]!.config.signup_source).toBe('declared');
  });
  it('o simulador calcula a SEMANA do chefe (vetores R$300 e R$350) e mantém o dia', async () => {
    const { s } = montar();
    const cfg = { ...chefe({ daily_base_cents: 15000, unit_cents: 1000 }) } as unknown as Record<string, unknown>;
    const a = await s.simular({ config: cfg, signups_confirmed: 0, days: [{ signups: 0, route_assigned: true }, { signups: 0, route_assigned: true }] }, AGORA);
    expect(a.week?.total_cents).toBe(30000);
    const b = await s.simular(
      {
        config: { ...chefe({ daily_base_cents: 10000, unit_cents: 1000, tiers: [{ min_signups: 5, amount_cents: 20000 }] }) } as unknown as Record<string, unknown>,
        signups_confirmed: 5,
        days: [{ signups: 5, route_assigned: true }],
      },
      AGORA,
    );
    expect(b.week?.total_cents).toBe(35000);
    expect(b.day.total_cents).toBe(5000); // o dia isolado não tem rota nem a meta (semanal)
    expect((await s.simular({ signups_confirmed: 10 }, AGORA)).day.total_cents).toBe(10000);
  });
});

describe('cálculo do chefe pelo serviço (tela de ganhos)', () => {
  it('diária pela rota da equipe + cadastros declarados + meta cumulativa = R$ 350', async () => {
    const { s, repo, inputs } = montar();
    vigente(repo, chefe({ daily_base_cents: 10000, unit_cents: 1000, tiers: [{ min_signups: 5, amount_cents: 20000 }] }));
    inputs.set(A, '2026-10-26', { declared: 5, route_equipe: true });
    const c = await equipe(s);
    expect(c.total_cents).toBe(35000);
    expect(c.conta.join(' ')).toContain('Metas semanais atingidas');
  });
  it('limite diário: 34 declarações, só 30 entram; o relatório da conta diz o excedente', async () => {
    const { s, repo, inputs } = montar();
    vigente(repo, chefe({ unit_cents: 1000 }));
    inputs.set(A, '2026-10-26', { declared: 34 });
    const c = await equipe(s);
    expect(c.total_cents).toBe(30000);
    expect(c.days[0]!.conta.join(' ')).toContain('4 declarações acima do limite');
  });
  it('sem rota da equipe a diária não paga e a conta explica', async () => {
    const { s, repo, inputs } = montar();
    vigente(repo, chefe({ daily_base_cents: 10000 }));
    inputs.set(A, '2026-10-26', { declared: 0 });
    const c = await equipe(s);
    expect(c.total_cents).toBe(0);
    expect(c.days[0]!.conta.join(' ')).toContain('não havia rota da equipe atribuída no dia');
  });
  it('a v1 não consulta os insumos novos (extras desligados) e o total é o de sempre', async () => {
    const { s, inputs } = montar();
    inputs.set(A, '2026-10-26', { signups: 10 });
    const spy = jest.spyOn(inputs, 'dias');
    const c = await equipe(s);
    expect(c.total_cents).toBe(10000);
    expect((spy.mock.calls[0] as unknown[])[4]).toEqual({ declared: false, routes: false });
  });
});

describe('desligar a flag não reescreve o passado', () => {
  it('versão declared vigente dá o MESMO total semanal com a flag ligada ou desligada', async () => {
    const ligado = montar({ declaradas: true, rotas: true });
    const desligado = montar({ declaradas: false, rotas: false });
    for (const m of [ligado, desligado]) {
      vigente(m.repo, chefe({ unit_cents: 1000 }));
      m.inputs.set(A, '2026-10-26', { declared: 7, signups: 3 });
    }
    expect((await equipe(ligado.s)).total_cents).toBe(7000);
    expect((await equipe(desligado.s)).total_cents).toBe(7000);
  });
});

describe('anulação no razão', () => {
  it('semana fechada: a anulação vira accrual NEGATIVO source=declaration_void na semana aberta; o fechado não muda', async () => {
    const { s, repo, inputs } = montar({ declaradas: true });
    vigente(repo, chefe({ unit_cents: 1000 }));
    inputs.set(A, '2026-10-20', { declared: 5 });
    await s.fechar({ week_start: SEMANA_ANT, consultant_id: A }, { id: null, name: 'sis' }, 'manual', AGORA);
    const fechado = repo.periods.find((p) => p.week_start === SEMANA_ANT)!;
    expect(fechado.total_cents).toBe(5000);
    // o admin anulou 2 declarações
    inputs.set(A, '2026-10-20', { declared: 3, declared_voided: 2 });
    const r = await s.reconciliar({ consultant_id: A }, { id: null, name: 'sis' }, AGORA);
    expect(r.posted).toBe(1);
    const neg = repo.ledger.find((l) => l.source === 'declaration_void')!;
    expect(neg).toMatchObject({ kind: 'accrual', amount_cents: -2000, work_day: '2026-10-20', payout_week: SEMANA_ATUAL });
    expect(repo.periods.find((p) => p.week_start === SEMANA_ANT)!.total_cents).toBe(5000);
    expect(repo.ledger.filter((l) => l.source === 'declaration_void')).toHaveLength(1);
    // reconciliar de novo não duplica
    expect((await s.reconciliar({ consultant_id: A }, { id: null, name: 'sis' }, AGORA)).posted).toBe(0);
    const c = await equipe(s);
    expect(c.total_cents).toBe(-2000);
  });
  it('semana aberta: o alvo simplesmente cai (sem estorno) e a conta diz quantas foram anuladas', async () => {
    const { s, repo, inputs } = montar({ declaradas: true });
    vigente(repo, chefe({ unit_cents: 1000 }));
    inputs.set(A, '2026-10-26', { declared: 3, declared_voided: 2 });
    const c = await equipe(s);
    expect(c.total_cents).toBe(3000);
    expect(c.days[0]!.conta.join(' ')).toContain('2 declarações anuladas no dia');
  });
});

describe('pagar uma vez por empresa', () => {
  it('confirmado pareado a declaração paga sob regra declared é excluído nos dias freela_confirmed', async () => {
    const { s, repo, inputs } = montar();
    // dia 19 e 20: regra declared; a partir do dia 26: volta ao Freela
    repo.versions[0]!.valid_from = '1970-01-01';
    repo.versions[0]!.config = chefe({ unit_cents: 1000, tiers_period: 'day' });
    repo.versions.push({ version: 2, valid_from: SEMANA_ATUAL, config: { ...REGRA_PADRAO }, reason: null, created_by_name: 'x', created_at: new Date() });
    // 3 confirmados no dia 26, 2 deles pareados a declarações feitas no dia 20 (regra declared)
    inputs.set(A, '2026-10-26', { signups: 3, pareados_declarados: ['2026-10-20', '2026-10-20'] });
    const c = await equipe(s);
    expect(c.total_cents).toBe(1000); // só 1 confirmado novo × R$ 10,00
  });
  it('pareado a declaração feita sob regra freela_confirmed (sombra) NÃO é excluído: paga pela confirmação', async () => {
    const { s, inputs } = montar();
    inputs.set(A, '2026-10-26', { signups: 3, pareados_declarados: ['2026-10-20'] });
    expect((await equipe(s)).total_cents).toBe(3000);
  });
});
