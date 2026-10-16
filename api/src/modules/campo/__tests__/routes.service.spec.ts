import type { PrismaService } from '../../../common/database/prisma.service';
import { RoutesService } from '../routes.service';

const PRACA = '00000000-0000-4000-8000-0000000000aa';
const ANA = '44444444-4444-4444-8444-444444444444';
// Quinta, 22/10/2026 às 10h de Brasília: a semana vai de 19 a 24; 22, 23 e 24 ainda dá para gerar.
const AGORA = new Date('2026-10-22T13:00:00.000Z');

const lead = (id: string, lat: number | null, extra: Record<string, unknown> = {}) => ({
  id,
  lat,
  lng: lat == null ? null : -43.9,
  bairro: 'Centro',
  classe: 'alvo',
  cnae: null,
  ...extra,
});

function fakePrisma(dados: {
  leads: ReturnType<typeof lead>[];
  visitas?: { lead_id: string; checkout_at: Date; final_status: string | null; final_date: string | null }[];
  iniciados?: string[];
  pendentes?: { lead_id: string; route: { day: string } }[];
}) {
  const criadas: { day: string; stops: { lead_id: string; position: number; reason: string }[] }[] = [];
  const tx = {
    field_routes: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn().mockImplementation(async ({ data }: { data: { day: string; stops: { create: { lead_id: string; position: number; reason: string }[] } } }) => {
        criadas.push({ day: data.day, stops: data.stops.create });
        return {};
      }),
    },
  };
  const p = {
    $transaction: jest.fn().mockImplementation(async (fn: (t: unknown) => Promise<unknown>) => fn(tx)),
    app_settings: { findUnique: jest.fn().mockResolvedValue(null) },
    field_consultants: {
      findMany: jest.fn().mockResolvedValue([
        { id: ANA, praca_id: PRACA, area_lat: null, area_lng: null, area_radius_km: null, area_bairros: [], praca: { route_daily_goal: 2 } },
      ]),
    },
    field_journeys: {
      findMany: jest.fn().mockImplementation(async ({ select }: { select: Record<string, boolean> }) =>
        select.ended_at ? [] : (dados.iniciados ?? []).map((day) => ({ day })),
      ),
    },
    leads: { findMany: jest.fn().mockResolvedValue(dados.leads) },
    field_visits: { findMany: jest.fn().mockResolvedValue(dados.visitas ?? []) },
    field_route_stops: {
      findMany: jest.fn().mockImplementation(async ({ where }: { where: { visit_id?: null } }) =>
        'visit_id' in where ? (dados.pendentes ?? []) : [],
      ),
    },
    field_routes: { findMany: jest.fn().mockResolvedValue([]) },
  };
  return { p, tx, criadas, s: new RoutesService(p as unknown as PrismaService) };
}

describe('RoutesService.generate (§21.5)', () => {
  it('gera só de hoje em diante, sem passar da meta, e conta quem está sem localização', async () => {
    const { criadas, s } = fakePrisma({
      leads: [lead('a', -19.9), lead('b', -19.91), lead('c', -19.92), lead('d', -19.93), lead('e', -19.94), lead('f', -19.95), lead('g', -19.96), lead('sem', null)],
    });
    const r = await s.generate({ week: '2026-10-19' }, 'admin', AGORA);
    expect(r.skipped_past).toBe(3);
    expect(r.generated).toBe(3);
    expect(r.sem_localizacao).toBe(1);
    expect(criadas.map((c) => c.day)).toEqual(['2026-10-22', '2026-10-23', '2026-10-24']);
    expect(criadas.every((c) => c.stops.length <= 2)).toBe(true);
    expect(criadas.flatMap((c) => c.stops).map((s) => s.lead_id)).not.toContain('sem');
  });

  it('dia já iniciado fica como está', async () => {
    const { criadas, s } = fakePrisma({ leads: [lead('a', -19.9)], iniciados: ['2026-10-22'] });
    const r = await s.generate({ week: '2026-10-22' }, 'admin', AGORA);
    expect(r.kept_started).toBe(1);
    expect(criadas.map((c) => c.day)).toEqual(['2026-10-23', '2026-10-24']);
  });

  it('"não quis" há menos de 30 dias fica de fora; retorno vai para o dia combinado', async () => {
    const { criadas, s } = fakePrisma({
      leads: [lead('naoquis', -19.9), lead('volta', -19.91), lead('novo', -19.92)],
      visitas: [
        { lead_id: 'naoquis', checkout_at: new Date('2026-10-10T15:00:00Z'), final_status: 'nao_quis', final_date: null },
        { lead_id: 'volta', checkout_at: new Date('2026-10-15T15:00:00Z'), final_status: 'ligar_depois', final_date: '2026-10-24' },
      ],
    });
    await s.generate({ week: '2026-10-19' }, 'admin', AGORA);
    const todas = criadas.flatMap((c) => c.stops.map((st) => ({ ...st, day: c.day })));
    expect(todas.map((t) => t.lead_id)).not.toContain('naoquis');
    expect(todas.find((t) => t.lead_id === 'volta')).toMatchObject({ day: '2026-10-24', reason: 'retorno' });
  });

  it('"não quis" há mais de 30 dias volta para a rota', async () => {
    const { criadas, s } = fakePrisma({
      leads: [lead('antigo', -19.9)],
      visitas: [{ lead_id: 'antigo', checkout_at: new Date('2026-09-01T15:00:00Z'), final_status: 'nao_quis', final_date: null }],
    });
    await s.generate({ week: '2026-10-19' }, 'admin', AGORA);
    expect(criadas.flatMap((c) => c.stops).map((s) => s.lead_id)).toContain('antigo');
  });

  it('parada de rota passada sem visita volta como pendente', async () => {
    const { criadas, s } = fakePrisma({ leads: [lead('p', -19.9), lead('n', -19.91)], pendentes: [{ lead_id: 'p', route: { day: '2026-10-20' } }] });
    await s.generate({ week: '2026-10-19' }, 'admin', AGORA);
    expect(criadas.flatMap((c) => c.stops).find((s) => s.lead_id === 'p')?.reason).toBe('pendente');
  });

  it('CNAE fora da lista da configuração não entra; sem CNAE entra', async () => {
    const { criadas, s } = fakePrisma({ leads: [lead('hotel', -19.9, { cnae: '9999999' }), lead('bar', -19.91, { cnae: '5611204' }), lead('semcnae', -19.92)] });
    await s.generate({ week: '2026-10-19' }, 'admin', AGORA);
    const ids = criadas.flatMap((c) => c.stops).map((s) => s.lead_id);
    expect(ids).toEqual(expect.arrayContaining(['bar', 'semcnae']));
    expect(ids).not.toContain('hotel');
  });
});
