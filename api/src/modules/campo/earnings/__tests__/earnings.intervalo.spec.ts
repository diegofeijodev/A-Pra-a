/**
 * Lote B §37.6: diária com tempo trabalhado mínimo pelo caminho REAL do cálculo (serviço + insumos), não só o simulador.
 * A v1 (e qualquer versão sem a chave) não busca o insumo novo.
 */
import { REGRA_PADRAO, type RegraBruta } from '../../../../domain/earnings-rules';
import type { RotasConfigService } from '../../../rotas/rotas-config.service';
import { EarningsService } from '../earnings.service';
import { A, AGORA, FakeInputs, FakeRepo } from './fakes';

const SEMANA_ATUAL = '2026-10-26';

function montar() {
  const repo = new FakeRepo();
  const inputs = new FakeInputs();
  const config = { cadastro: async () => ({ confirmation_rule: 'activated' as const }) } as unknown as RotasConfigService;
  const s = new EarningsService(repo, inputs, config, { ligado: true, autoClose: false, janelaNaoConfirmadosDias: 45, intervaloLigado: true });
  return { s, repo, inputs };
}
const vigente = (repo: FakeRepo, cfg: RegraBruta) => {
  (repo.versions[0] as { config: RegraBruta }).config = cfg;
};
const equipe = async (s: EarningsService) => (await s.equipe({ week: SEMANA_ATUAL }, AGORA)).consultants.find((c) => c.consultant_id === A)!;
const COM_MINIMO: RegraBruta = { ...REGRA_PADRAO, daily_base_cents: 15000, daily_base_condition: 'journey_open', daily_base_min_worked_minutes: 360 };

describe('diária com tempo trabalhado mínimo (serviço)', () => {
  it('a regra sem a chave não pede o insumo novo (extras sem worked)', async () => {
    const { s, inputs } = montar();
    inputs.set(A, '2026-10-26', { signups: 0, journey: true });
    const spy = jest.spyOn(inputs, 'dias');
    await equipe(s);
    expect((spy.mock.calls[0] as unknown[])[4]).toEqual({ declared: false, routes: false });
  });
  it('com a chave: pede worked; 300 min não paga (com a conta), 361 min paga a diária', async () => {
    const { s, repo, inputs } = montar();
    vigente(repo, COM_MINIMO);
    const spy = jest.spyOn(inputs, 'dias');
    inputs.set(A, '2026-10-26', { signups: 0, journey: true, worked_minutes: 300 });
    const abaixo = await equipe(s);
    expect((spy.mock.calls[0] as unknown[])[4]).toEqual({ declared: false, routes: false, worked: true });
    expect(abaixo.total_cents).toBe(0);
    expect(abaixo.days[0]!.conta.join(' ')).toContain('foram 5h00 trabalhados (jornada menos intervalo) e o mínimo é 6h00');
    inputs.set(A, '2026-10-26', { signups: 0, journey: true, worked_minutes: 361 });
    expect((await equipe(s)).total_cents).toBe(15000);
  });
  it('dia sem o insumo (sem jornada) conta 0 minutos: não paga', async () => {
    const { s, repo, inputs } = montar();
    vigente(repo, { ...COM_MINIMO, daily_base_condition: 'none', daily_base_requires_journey: false });
    inputs.set(A, '2026-10-26', { signups: 0 });
    expect((await equipe(s)).total_cents).toBe(0);
  });
});
