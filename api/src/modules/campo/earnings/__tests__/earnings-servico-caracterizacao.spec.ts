/**
 * CARACTERIZAÇÃO do serviço de remuneração (F8/F9 em produção) ANTES do lote F (L11 bônus mensal, L13 regra por consultor).
 * Congela, byte a byte, o que as rotas devolvem e o que o razão grava com a regra v1 e com uma regra semanal: extrato da
 * equipe, ganhos do consultor, fechamento, confirmação tardia, ajuste, fechamento automático, simulador e configuração.
 * Gerado sobre o código de antes do lote. NÃO edite para "fazer passar": se mudou, o comportamento de hoje mudou.
 */
import type { AuthUser } from '../../../../common/auth/auth-user';
import { REGRA_PADRAO, type RegraBruta } from '../../../../domain/earnings-rules';
import type { RotasConfigService } from '../../../rotas/rotas-config.service';
import { EarningsService } from '../earnings.service';
import { A, AGORA, B, FakeInputs, FakeRepo } from './fakes';

const ADMIN: AuthUser = {
  id: 'dddddddd-0000-4000-8000-000000000001',
  email: 'a@x.com',
  name: 'Diego',
  is_admin: true,
};
const ATOR = { id: ADMIN.id, name: ADMIN.name };
const SEMANA_ANT = '2026-10-19';
const SEMANA_ATUAL = '2026-10-26';
/** Segunda 02/11/2026, 07:00 em Brasília (dia do Pix, depois da hora do fechamento automático). */
const SEGUNDA_PIX = new Date('2026-11-02T10:00:00.000Z');
const CID = (n: number) => `eeeeeeee-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** Tira o que é aleatório ou do relógio da máquina (ids do razão, `created_at` das linhas novas). Resto: byte a byte. */
function limpo<T>(x: T): unknown {
  const fixos = new Set([A, B, ADMIN.id]);
  return JSON.parse(
    JSON.stringify(x, (k, v) => {
      if ((k === 'id' || k === 'reverses_id' || k === 'reverses') && typeof v === 'string' && !fixos.has(v))
        return '<id>';
      if ((k === 'created_at' || k === 'installed_at') && v !== '2026-10-01T00:00:00.000Z') return '<agora>';
      return v;
    }),
  );
}

function montar(opts: { autoClose?: boolean; regra?: RegraBruta } = {}) {
  const repo = new FakeRepo();
  if (opts.regra) (repo.versions[0] as { config: RegraBruta }).config = opts.regra;
  const inputs = new FakeInputs();
  const config = {
    cadastro: async () => ({ confirmation_rule: 'activated' as const }),
  } as unknown as RotasConfigService;
  const s = new EarningsService(repo, inputs, config, {
    ligado: true,
    autoClose: opts.autoClose ?? false,
    janelaNaoConfirmadosDias: 45,
  });
  // Movimento de duas semanas, dos dois consultores: dias com 0, 4, 9, 10, 12 e 20 cadastros, visitas e jornada.
  inputs.set(A, '2026-10-19', { signups: 4, visits_checkin: 6, visits_checkout: 5, journey: true });
  inputs.set(A, '2026-10-20', { signups: 20, visits_checkin: 25, visits_checkout: 24, journey: true });
  inputs.set(A, '2026-10-22', { signups: 0, visits_checkin: 3, visits_checkout: 1, journey: true });
  inputs.set(B, '2026-10-21', { signups: 10, visits_checkin: 12, visits_checkout: 12, journey: true });
  inputs.set(B, '2026-10-24', { signups: 9, visits_checkin: 9, visits_checkout: 8, journey: true });
  inputs.set(A, '2026-10-26', { signups: 12, visits_checkin: 14, visits_checkout: 13, journey: true });
  inputs.set(A, '2026-10-27', { signups: 3, visits_checkin: 4, visits_checkout: 2, journey: true });
  inputs.set(B, '2026-10-27', { signups: 1, visits_checkin: 2, visits_checkout: 2, journey: true });
  inputs.naoConf.set(A, 2);
  return { s, repo, inputs };
}

const REGRA_SEMANAL: RegraBruta = {
  ...REGRA_PADRAO,
  tiers_period: 'week',
  tiers: [
    { min_signups: 15, amount_cents: 20000 },
    { min_signups: 30, amount_cents: 45000 },
  ],
  combine: 'max',
  cap_cents: 40000,
  floor_cents: 3000,
  floor_condition: 'journey_open',
};

describe.each([
  ['v1 (faixa por dia)', undefined],
  ['regra semanal (faixa, teto e piso)', REGRA_SEMANAL],
])('caracterização do serviço — %s', (_nome, regra) => {
  it('extrato da equipe (semana anterior aberta e semana atual com o razão)', async () => {
    const { s } = montar({ regra });
    expect(limpo(await s.equipe({ week: SEMANA_ANT }, AGORA))).toMatchSnapshot();
    expect(limpo(await s.equipe({ week: SEMANA_ATUAL, consultant_id: A }, AGORA))).toMatchSnapshot();
  });

  it('ganhos do consultor (hoje, semana, não confirmados, Pix e semanas anteriores)', async () => {
    const { s } = montar({ regra });
    expect(limpo(await s.doConsultor({ id: A } as never, AGORA))).toMatchSnapshot();
  });

  it('fechamento, razão, confirmação tardia, ajuste e estorno', async () => {
    const { s, repo, inputs } = montar({ regra });
    expect(limpo(await s.fechar({ week_start: SEMANA_ANT }, ATOR, 'manual', AGORA))).toMatchSnapshot();
    expect(limpo(repo.ledger)).toMatchSnapshot();
    expect(limpo(repo.periods)).toMatchSnapshot();
    // repetir não duplica
    expect(limpo(await s.fechar({ week_start: SEMANA_ANT }, ATOR, 'manual', AGORA))).toMatchSnapshot();
    // confirmação tardia na semana fechada: entra na primeira aberta
    inputs.set(A, '2026-10-21', { signups: 11 });
    expect(limpo(await s.equipe({ week: SEMANA_ATUAL, consultant_id: A }, AGORA))).toMatchSnapshot();
    expect(limpo(await s.reconciliar({}, ATOR, AGORA))).toMatchSnapshot();
    const aj = await s.ajustar(
      { consultant_id: A, amount_cents: -1500, reason: 'Desconto combinado', client_id: CID(1) },
      ADMIN,
      AGORA,
    );
    expect(limpo(aj)).toMatchSnapshot();
    expect(
      limpo(await s.estornar(aj.id, { reason: 'Lançado errado', client_id: CID(2) }, ADMIN, AGORA)),
    ).toMatchSnapshot();
    expect(limpo(repo.ledger)).toMatchSnapshot();
    expect(limpo(await s.equipe({ week: SEMANA_ATUAL, consultant_id: A }, AGORA))).toMatchSnapshot();
    expect(limpo(await s.doConsultor({ id: A } as never, AGORA))).toMatchSnapshot();
  });

  it('fechamento automático na segunda do Pix (e a segunda rodada não faz nada)', async () => {
    const { s, repo } = montar({ regra, autoClose: true });
    expect(await s.deveFecharAgora(SEGUNDA_PIX)).toBe(true);
    expect(limpo(await s.fecharEncerradas(SEGUNDA_PIX))).toMatchSnapshot();
    expect(limpo(repo.ledger)).toMatchSnapshot();
    expect(limpo(repo.periods)).toMatchSnapshot();
    const linhas = repo.ledger.length;
    expect(limpo(await s.fecharEncerradas(SEGUNDA_PIX))).toMatchSnapshot();
    expect(repo.ledger).toHaveLength(linhas);
  });

  it('simulador (dia e semana) e configuração', async () => {
    const { s } = montar({ regra });
    expect(
      await s.simular({ signups_confirmed: 12, visits: 3, journey_open: true }, AGORA),
    ).toMatchSnapshot();
    expect(
      await s.simular(
        {
          signups_confirmed: 0,
          days: [{ signups: 4 }, { signups: 20, journey_open: true }, { signups: 0 }, { signups: 9 }],
        },
        AGORA,
      ),
    ).toMatchSnapshot();
    expect(limpo(await s.lerConfig(AGORA))).toMatchSnapshot();
  });
});
