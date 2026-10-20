import { CONFIG_ROTA_PADRAO } from '../../../domain/rota-rules';

export const PRACA = '00000000-0000-4000-8000-0000000000aa';
export const PRACA_B = '00000000-0000-4000-8000-0000000000bb';
export const CONS_A = '44444444-4444-4444-8444-44444444444a';
export const CONS_B = '44444444-4444-4444-8444-44444444444b';
export const ROTA = '55555555-5555-4555-8555-555555555555';
export const CLI = (n: number) => `99999999-9999-4999-8999-${String(n).padStart(12, '0')}`;
export const STOP = (n: number) => `66666666-6666-4666-8666-${String(n).padStart(12, '0')}`;
export const LEAD = (n: number) => `77777777-7777-4777-8777-${String(n).padStart(12, '0')}`;
/** 11:00 em Brasília. */
export const AGORA = new Date('2026-10-20T14:00:00.000Z');
export const DIA = '2026-10-20';

export const stopRow = (n: number, over: Record<string, unknown> = {}) => ({
  id: STOP(n),
  route_id: ROTA,
  lead_id: LEAD(n),
  day: DIA,
  seq: n,
  kind: 'planejada',
  status: 'pendente',
  fixa: false,
  eta_min: 600 + n * 10,
  planned_minutes: 8,
  distance_m: 100,
  skip_reason: null,
  skip_note: null,
  deferred_to: null,
  visit_id: null,
  candidate_id: null,
  name_snap: `Bar ${n}`,
  address_snap: `Rua ${n}`,
  phone_snap: '',
  lat_snap: -23.6 + n * 0.001,
  lng_snap: -46.66,
  created_at: AGORA,
  updated_at: AGORA,
  ...over,
});

export const rotaRow = (over: Record<string, unknown> = {}) => ({
  id: ROTA,
  consultant_id: CONS_A,
  praca_id: PRACA,
  area_id: null,
  day: DIA,
  status: 'ativa',
  version: 1,
  source: 'equipe',
  start_lat: -23.6,
  start_lng: -46.66,
  params_snapshot: { config: CONFIG_ROTA_PADRAO, not_fit: 0, versoes: [] },
  created_by: null,
  created_at: AGORA,
  updated_at: AGORA,
  consultant: { name: 'Ana' },
  stops: [stopRow(1), stopRow(2), stopRow(3)],
  ...over,
});

/** Prisma de mentira: `$transaction(fn)` roda `fn` no mesmo objeto. */
export function fakePrisma(over: Record<string, unknown> = {}) {
  const rota = rotaRow();
  const p: Record<string, any> = {
    field_routes: {
      findFirst: jest.fn().mockResolvedValue(rota),
      findUnique: jest.fn().mockResolvedValue(rota),
      findUniqueOrThrow: jest.fn().mockResolvedValue(rota),
      findMany: jest.fn().mockResolvedValue([rota]),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    field_route_stops: {
      findFirst: jest.fn().mockResolvedValue({ id: STOP(1), route_id: ROTA, status: 'pendente' }),
      findMany: jest.fn().mockResolvedValue(rota.stops),
      create: jest.fn().mockResolvedValue({}),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      count: jest.fn().mockResolvedValue(0),
    },
    field_route_events: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
    },
    field_areas: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
    field_consultants: { findUnique: jest.fn().mockResolvedValue({ id: CONS_A, praca_id: PRACA, active: true }) },
    field_visits: { findMany: jest.fn().mockResolvedValue([]), groupBy: jest.fn().mockResolvedValue([]) },
    leads: { findMany: jest.fn().mockResolvedValue([]) },
    blocklist: { findMany: jest.fn().mockResolvedValue([]) },
    place_candidates: { findMany: jest.fn().mockResolvedValue([]) },
    pracas: { findUnique: jest.fn().mockResolvedValue({ id: PRACA }) },
    app_settings: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn().mockResolvedValue({}) },
    ...over,
  };
  p.$transaction = jest.fn(async (arg: unknown) => (Array.isArray(arg) ? Promise.all(arg) : (arg as (t: unknown) => Promise<unknown>)(p)));
  return p;
}
