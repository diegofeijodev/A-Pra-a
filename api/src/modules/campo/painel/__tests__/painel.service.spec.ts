import type { PrismaService } from '../../../../common/database/prisma.service';
import { CONFIG_PAINEL } from '../../../../domain/painel-rules';
import { PRESET_CHEFE } from '../../../../domain/earnings-rules';
import type { RotasConfigService } from '../../../rotas/rotas-config.service';
import { A, B, FakeInputs, FakeRepo } from '../../earnings/__tests__/fakes';
import { CadastrosDoDiaService } from '../cadastros-do-dia.service';
import { DashboardLigadoGuard, DaySummaryLigadoGuard, MapPinsLigadoGuard } from '../lovable.guards';
import { PainelService } from '../painel.service';

const PRACA_A = 'aaaaaaaa-1111-4000-8000-00000000000a';
const AGORA = new Date('2026-10-21T15:00:00.000Z'); // 12:00 de Brasília

function fakePrisma(consultores = [{ id: A, name: 'Ana', praca_id: PRACA_A, active: true }, { id: B, name: 'Bruno', praca_id: PRACA_A, active: true }]) {
  return {
    pracas: { findUnique: jest.fn().mockResolvedValue({ id: PRACA_A }), findMany: jest.fn().mockResolvedValue([{ start_date: '2026-10-01' }, { start_date: '2026-11-01' }]) },
    field_consultants: { findMany: jest.fn().mockResolvedValue(consultores) },
    field_visits: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'v1', consultant_id: A, checkin_at: new Date('2026-10-21T12:00:00Z'), checkout_at: new Date('2026-10-21T12:07:00Z'), outcome: 'conversa', result: 'cadastrou', freela_status: 'declarou', needs_followup: false, refusal_reason: null, journey: { day: '2026-10-21' } },
        { id: 'v2', consultant_id: A, checkin_at: new Date('2026-10-21T12:20:00Z'), checkout_at: new Date('2026-10-21T12:25:00Z'), outcome: 'fechado', result: 'fechado', freela_status: null, needs_followup: false, refusal_reason: null, journey: { day: '2026-10-21' } },
      ]),
    },
    field_route_stops: {
      findMany: jest.fn().mockResolvedValue([
        { kind: 'planejada', status: 'visitada', visit_id: 'v1' },
        { kind: 'planejada', status: 'pendente', visit_id: null },
        { kind: 'planejada', status: 'descartada', visit_id: null },
        { kind: 'reserva', status: 'pendente', visit_id: null },
      ]),
    },
    leads: { count: jest.fn().mockResolvedValueOnce(8).mockResolvedValueOnce(10) },
  };
}

function montar(p = fakePrisma(), repo = new FakeRepo(), inputs = new FakeInputs()) {
  const configs = { painel: async () => CONFIG_PAINEL.padrao, cadastro: async () => ({ confirmation_rule: 'activated' as const }) } as unknown as RotasConfigService;
  const cad = new CadastrosDoDiaService(repo, inputs, configs);
  return { s: new PainelService(p as unknown as PrismaService, configs, cad, { ligado: false, intervaloMin: 10, janelaDias: 45 }), p, inputs };
}
const falha = async (f: () => Promise<unknown>) => f().then(() => null, (e: unknown) => e as { getStatus(): number; getResponse(): { code: string } });

describe('PainelService (contrato §33.4)', () => {
  it('padrão = hoje (Brasília); visitas filtradas pelo dia da jornada; cartões com a conta', async () => {
    const { s, p } = montar();
    const r = await s.painel({}, AGORA);
    expect(r).toMatchObject({ from: '2026-10-21', to: '2026-10-21', praca_id: null, today: '2026-10-21' });
    expect(p.field_visits.findMany.mock.calls[0][0].where).toMatchObject({ checkout_at: { not: null }, journey: { day: { gte: '2026-10-21', lte: '2026-10-21' } } });
    expect(r.kpis).toMatchObject({ planned_stops: 2, done_stops: 1, pct_done: 50, visits: 2, visits_off_route: 1, declared_now: 1, pracas_open: 1, leads_mapped: 8, leads_without_exact_location: 2, vouchers: null });
    expect(r.by_result.reduce((a: number, x: { n: number }) => a + x.n, 0)).toBe(2);
    expect(r.conta.pct_done).toBe('1 de 2 paradas planejadas nas rotas = 50%.');
    expect(r.signup_sync_enabled).toBe(false);
  });

  it('cadastros = cadastrosDoDia: confirmados por padrão; declarados nos dias de regra "declarado"', async () => {
    const inputs = new FakeInputs();
    inputs.set(A, '2026-10-21', { signups: 1, declared: 3 });
    const r1 = await montar(fakePrisma(), new FakeRepo(), inputs).s.painel({}, AGORA);
    expect(r1.kpis).toMatchObject({ signups: 1, signups_source: 'freela_confirmed' });
    const repo = new FakeRepo();
    repo.versions.push({ version: 2, valid_from: '2026-10-20', config: PRESET_CHEFE, reason: null, created_by_name: 'Diego', created_at: new Date() });
    const r2 = await montar(fakePrisma(), repo, inputs).s.painel({}, AGORA);
    expect(r2.kpis).toMatchObject({ signups: 3, signups_source: 'declared', positivation_pct: 150 });
    expect(r2.ranking[0]).toMatchObject({ consultant_id: A, signups: 3 });
  });

  it('praça filtra consultores e estabelecimentos; praça inexistente = 404; período > 92 dias = 400', async () => {
    const { s, p } = montar();
    await s.painel({ praca_id: PRACA_A }, AGORA);
    expect(p.field_consultants.findMany.mock.calls[0][0].where).toEqual({ praca_id: PRACA_A });
    expect(p.leads.count.mock.calls[0][0].where).toMatchObject({ praca_id: PRACA_A, archived: false, is_test: false });
    expect(p.field_visits.findMany.mock.calls[0][0].where.consultant_id).toEqual({ in: [A, B] });
    const p2 = fakePrisma();
    p2.pracas.findUnique.mockResolvedValue(null);
    expect((await falha(() => montar(p2).s.painel({ praca_id: PRACA_A }, AGORA)))?.getResponse().code).toBe('NOT_FOUND');
    expect((await falha(() => montar().s.painel({ from: '2026-01-01', to: '2026-10-21' }, AGORA)))?.getStatus()).toBe(400);
  });

  it('sem N+1: o número de consultas não cresce com o número de consultores', async () => {
    const conta = async (n: number) => {
      const consultores = Array.from({ length: n }, (_, i) => ({ id: `c${i}`, name: `C${i}`, praca_id: PRACA_A, active: true }));
      const p = fakePrisma(consultores);
      const inputs = new FakeInputs();
      await montar(p, new FakeRepo(), inputs).s.painel({}, AGORA);
      const chamadas = Object.values(p).flatMap((m) => Object.values(m as Record<string, jest.Mock>)).reduce((a, f) => a + f.mock.calls.length, 0);
      return chamadas + inputs.chamadas.dias.length;
    };
    expect(await conta(30)).toBe(await conta(2));
  });
});

describe('travas do lote A (404 com a flag desligada)', () => {
  const off = { dashboard: false, day_summary: false, map_pins: false };
  const on = { dashboard: true, day_summary: true, map_pins: true };
  it.each([
    [DashboardLigadoGuard, 'DASHBOARD_DISABLED'],
    [DaySummaryLigadoGuard, 'DAY_SUMMARY_DISABLED'],
    [MapPinsLigadoGuard, 'MAP_PINS_DISABLED'],
  ])('%p', (G, code) => {
    expect(new G(on).canActivate()).toBe(true);
    try {
      new G(off).canActivate();
      throw new Error('não lançou');
    } catch (e) {
      expect((e as { getStatus(): number }).getStatus()).toBe(404);
      expect((e as { getResponse(): { code: string } }).getResponse().code).toBe(code);
    }
  });
});
