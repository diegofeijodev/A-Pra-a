import type { CampoConsultant } from '../../../common/auth/campo-consultant';
import type { PrismaService } from '../../../common/database/prisma.service';
import { PainelService, stopTimings } from '../painel.service';

const ANA = '44444444-4444-4444-8444-444444444444';
const BIA = '55555555-5555-4555-8555-555555555555';
const C: CampoConsultant = { id: ANA, name: 'Ana', email: 'a@x', praca_id: 'p', must_change_password: false };
const AGORA = new Date('2026-10-22T15:00:00.000Z'); // quinta

describe('PainelService.admin (§21.9)', () => {
  function montar() {
    const p = {
      field_consultants: {
        findMany: jest.fn().mockResolvedValue([
          { id: ANA, name: 'Ana', active: true },
          { id: BIA, name: 'Bia', active: true },
        ]),
      },
      field_routes: {
        findMany: jest.fn().mockResolvedValue([
          { consultant_id: ANA, day: '2026-10-22', goal: 20 },
          { consultant_id: BIA, day: '2026-10-22', goal: 20 },
        ]),
      },
      field_journeys: { findMany: jest.fn().mockResolvedValue([{ consultant_id: ANA, day: '2026-10-22' }]) },
      field_visits: {
        findMany: jest.fn().mockResolvedValue([
          { consultant_id: ANA, final_status: 'cadastrou', checkout_at: AGORA, form_version: 2 },
          { consultant_id: ANA, final_status: 'nao_quis', checkout_at: AGORA, form_version: 2 },
          { consultant_id: ANA, final_status: null, checkout_at: null, form_version: 2 },
        ]),
      },
      field_vouchers: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([{ consultant_id: ANA }])
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([]),
      },
      lead_vagas: { findMany: jest.fn().mockResolvedValue([{ visit: { consultant_id: ANA } }, { visit: { consultant_id: ANA } }]) },
    };
    return { p, s: new PainelService(p as unknown as PrismaService) };
  }

  it('conta rotas iniciadas/abertas, visitas, % da meta, cadastros, vouchers e vagas', async () => {
    const r = await montar().s.admin({}, AGORA);
    expect(r.from).toBe('2026-10-22');
    expect(r.totals).toMatchObject({
      rotas: 2,
      rotas_iniciadas: 1,
      rotas_abertas: 1,
      visitas: 3,
      meta: 40,
      pct_meta: 8,
      cadastros: 1,
      vouchers_solicitados: 1,
      vagas: 2,
    });
    expect(r.por_representante.map((x) => x.name)).toEqual(['Ana', 'Bia']);
    expect(r.por_representante[1]).toMatchObject({ visitas: 0, pct_meta: 0 });
  });

  it('período invertido ou longo demais = 400', async () => {
    await expect(montar().s.admin({ from: '2026-10-22', to: '2026-10-01' }, AGORA)).rejects.toMatchObject({ response: { code: 'VALIDATION_ERROR' } });
    await expect(montar().s.admin({ from: '2026-01-01', to: '2026-10-01' }, AGORA)).rejects.toMatchObject({ response: { code: 'VALIDATION_ERROR' } });
  });
});

describe('PainelService.campo — Meus números (§21.9)', () => {
  const lead = (id: string, vagas: Date[]) => ({ id, name: id, address: '', phone: '', lat: null, lng: null, stage: 5, vagas: vagas.map((created_at) => ({ created_at })) });

  it('as listas: cadastrou, abriu vaga, nunca abriu e sem vaga há 30 dias', async () => {
    const p = {
      field_route_stops: { findMany: jest.fn().mockResolvedValue([{ visit_id: 'v' }, { visit_id: null }]) },
      field_visits: { findMany: jest.fn().mockResolvedValue([{ lead_id: 'novo' }]) },
      field_vouchers: { count: jest.fn().mockResolvedValue(1) },
      lead_vagas: { count: jest.fn().mockResolvedValue(2) },
      leads: {
        findMany: jest.fn().mockResolvedValue([
          lead('novo', []),
          lead('ativo', [new Date('2026-10-22T13:00:00Z')]),
          lead('parado', [new Date('2026-08-01T13:00:00Z')]),
        ]),
      },
    };
    const r = await new PainelService(p as unknown as PrismaService).campo(C, 'semana', AGORA);
    expect(r).toMatchObject({ from: '2026-10-19', to: '2026-10-24' });
    expect(r.numbers).toEqual({ clientes_na_rota: 2, visitados: 1, cadastrados: 1, vouchers: 1, vagas: 2 });
    expect(r.cadastrou.map((c) => c.lead_id)).toEqual(['novo']);
    expect(r.abriu_vaga.map((c) => c.lead_id)).toEqual(['ativo']);
    expect(r.nunca_abriu.map((c) => c.lead_id)).toEqual(['novo']);
    expect(r.sem_vaga_30d.map((c) => c.lead_id)).toEqual(['parado']);
  });
});

it('stopTimings: ordena por check-in e calcula os minutos', () => {
  const v = (id: string, ini: string, fim: string | null) => ({
    id, lead_id: id, checkin_at: new Date(ini), checkout_at: fim ? new Date(fim) : null, checkin_lat: 0, checkin_lng: 0,
    far_from_place: false, off_route: false, off_hours: false, auto_closed: false, clock_adjusted: false, final_status: null, lead: { name: id },
  });
  const r = stopTimings([v('b', '2026-10-22T13:00:00Z', '2026-10-22T13:20:00Z'), v('a', '2026-10-22T12:10:00Z', '2026-10-22T12:40:00Z')], new Date('2026-10-22T12:00:00Z'));
  expect(r.map((x) => [x.visit_id, x.minutes_on_site, x.minutes_travel])).toEqual([
    ['a', 30, 10],
    ['b', 20, 20],
  ]);
});
