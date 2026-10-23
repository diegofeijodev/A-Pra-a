/**
 * Lote F2 (contrato §44.5): a praça do início do dia. Desligada, só a principal (outra = 422) e nada gravado; ligada, a pedida
 * no conjunto (senão 404), senão a do roteiro de hoje, senão a principal — sempre explícita. O reenvio da fila nunca é barrado.
 */
import type { CampoConsultant } from '../../../common/auth/campo-consultant';
import type { PrismaService } from '../../../common/database/prisma.service';
import { PracasDoConsultorService } from '../../../common/pracas/pracas-do-consultor.service';
import { JourneysService } from '../journeys.service';

const CONS = '44444444-4444-4444-8444-444444444444';
const A = '00000000-0000-4000-8000-0000000000aa';
const B = '00000000-0000-4000-8000-0000000000bb';
const X = '00000000-0000-4000-8000-0000000000cc';
const CLIENT = '77777777-7777-4777-8777-777777777777';
const AGORA = new Date('2026-10-08T15:00:00.000Z');
const POS = { at: '2026-10-08T14:59:00.000Z', lat: -19.9245, lng: -43.9352, accuracy: 12 };
const OFF: CampoConsultant = { id: CONS, name: 'Ana', email: 'ana@exemplo.com', praca_id: A, must_change_password: false };
const ON: CampoConsultant = { ...OFF, praca_principal_id: A };

const JORNADA = {
  id: 'j1',
  consultant_id: CONS,
  client_id: CLIENT,
  day: '2026-10-08',
  started_at: new Date('2026-10-08T14:59:00.000Z'),
  start_lat: POS.lat,
  start_lng: POS.lng,
  start_accuracy: 12,
  ended_at: null,
  end_lat: null,
  end_lng: null,
  end_accuracy: null,
  auto_closed: false,
  praca_id: null as string | null,
};

function fakePrisma(o: { extras?: string[]; rotaDeHoje?: string | null; gravada?: string | null } = {}) {
  const p = {
    $transaction: jest.fn(),
    field_journeys: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ ...JORNADA, praca_id: o.gravada ?? null }),
      create: jest.fn().mockResolvedValue(JORNADA),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    field_points: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn().mockResolvedValue({}) },
    field_visits: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
    field_routes: { findFirst: jest.fn().mockResolvedValue(o.rotaDeHoje ? { praca_id: o.rotaDeHoje } : null) },
    field_consultant_pracas: { findMany: jest.fn().mockResolvedValue((o.extras ?? []).map((praca_id) => ({ praca_id }))) },
  };
  p.$transaction.mockImplementation(async (arg: unknown) => (Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => Promise<unknown>)(p)));
  return p;
}

function montar(p: ReturnType<typeof fakePrisma>, ligado: boolean) {
  const rotas = { gerarAoIniciar: jest.fn().mockResolvedValue(undefined) };
  const pracas = new PracasDoConsultorService(p as unknown as PrismaService, ligado);
  const s = new JourneysService(p as unknown as PrismaService, rotas as never, undefined, undefined, undefined, undefined, undefined, pracas);
  return { s, rotas };
}
const dataDaJornada = (p: ReturnType<typeof fakePrisma>) => (p.field_journeys.create.mock.calls[0]![0] as { data: Record<string, unknown> }).data;

describe('journeys/start com a flag DESLIGADA (§44.1)', () => {
  it.each([[undefined], [null], [A]])('praca_id %p = como hoje: nada gravado, nada lido a mais, a view de hoje', async (praca_id) => {
    const p = fakePrisma({ extras: [B], rotaDeHoje: B });
    const { s, rotas } = montar(p, false);
    const j = await s.start(OFF, { client_id: CLIENT, ...POS, ...(praca_id !== undefined ? { praca_id } : {}) }, AGORA);
    expect(dataDaJornada(p)).not.toHaveProperty('praca_id');
    expect(p.field_consultant_pracas.findMany).not.toHaveBeenCalled();
    expect(p.field_routes.findFirst).not.toHaveBeenCalled();
    expect(rotas.gerarAoIniciar).toHaveBeenCalledWith(OFF, { lat: POS.lat, lng: POS.lng }, AGORA);
    expect(j).not.toHaveProperty('praca_id');
  });

  it('outra praça = 422 MULTI_PRACA_DISABLED e nada criado (mesmo estando na junção)', async () => {
    const p = fakePrisma({ extras: [B] });
    await expect(montar(p, false).s.start(OFF, { client_id: CLIENT, ...POS, praca_id: B }, AGORA)).rejects.toMatchObject({
      status: 422,
      response: { code: 'MULTI_PRACA_DISABLED' },
    });
    expect(p.field_journeys.create).not.toHaveBeenCalled();
  });
});

describe('journeys/start com a flag LIGADA (§44.5)', () => {
  it('pedida no conjunto: grava B, o roteiro automático nasce em B e a view diz B', async () => {
    const p = fakePrisma({ extras: [B], gravada: B });
    const { s, rotas } = montar(p, true);
    const j = await s.start(ON, { client_id: CLIENT, ...POS, praca_id: B }, AGORA);
    expect(dataDaJornada(p).praca_id).toBe(B);
    expect(rotas.gerarAoIniciar).toHaveBeenCalledWith({ ...ON, praca_id: B }, { lat: POS.lat, lng: POS.lng }, AGORA);
    expect(j.praca_id).toBe(B);
  });

  it('consultor ligado só a A não inicia em B: 404 e nada criado', async () => {
    const p = fakePrisma({ extras: [] });
    await expect(montar(p, true).s.start(ON, { client_id: CLIENT, ...POS, praca_id: B }, AGORA)).rejects.toMatchObject({
      status: 404,
      response: { code: 'NOT_FOUND', message: 'Praça não encontrada entre as suas.' },
    });
    expect(p.field_journeys.create).not.toHaveBeenCalled();
  });

  it('sem pedido: a praça do roteiro de hoje (no conjunto)', async () => {
    const p = fakePrisma({ extras: [B], rotaDeHoje: B, gravada: B });
    await montar(p, true).s.start(ON, { client_id: CLIENT, ...POS }, AGORA);
    expect(dataDaJornada(p).praca_id).toBe(B);
  });

  it('sem pedido e sem roteiro (ou roteiro fora do conjunto): a principal, gravada explícita', async () => {
    for (const rotaDeHoje of [null, X]) {
      const p = fakePrisma({ extras: [B], rotaDeHoje, gravada: A });
      await montar(p, true).s.start(ON, { client_id: CLIENT, ...POS, praca_id: null }, AGORA);
      expect(dataDaJornada(p).praca_id).toBe(A);
    }
  });

  it('o reenvio do mesmo client_id devolve a jornada sem conferir a praça (a fila não perde o início)', async () => {
    const p = fakePrisma({ extras: [] });
    p.field_journeys.findUnique.mockResolvedValue({ ...JORNADA, praca_id: B });
    const j = await montar(p, true).s.start(ON, { client_id: CLIENT, ...POS, praca_id: X }, AGORA);
    expect(j).toMatchObject({ id: 'j1', praca_id: B });
    expect(p.field_journeys.create).not.toHaveBeenCalled();
  });

  it('today: as jornadas saem com a praça (a nula antiga como a principal)', async () => {
    const p = fakePrisma({ extras: [B] });
    p.field_journeys.findMany.mockImplementation(async (a: { where: { ended_at?: unknown } }) =>
      a.where.ended_at === null ? [] : [{ ...JORNADA, id: 'j0', ended_at: new Date('2026-10-08T13:00:00.000Z') }, { ...JORNADA, praca_id: B }],
    );
    p.field_journeys.findFirst.mockResolvedValue({ ...JORNADA, praca_id: B });
    const t = await montar(p, true).s.today({ ...ON, praca_id: B }, AGORA);
    expect(t.journeys.map((j) => j.praca_id)).toEqual([A, B]);
    expect(t.journey?.praca_id).toBe(B);
  });

  it('pracasDoInicio: o conjunto e o padrão; desligada, null sem ler nada', async () => {
    const p = fakePrisma({ extras: [B], rotaDeHoje: B });
    expect(await montar(p, true).s.pracasDoInicio(ON, AGORA)).toEqual({ conjunto: [A, B], padrao: B });
    const q = fakePrisma({ extras: [B], rotaDeHoje: B });
    expect(await montar(q, false).s.pracasDoInicio(OFF, AGORA)).toBeNull();
    expect(q.field_consultant_pracas.findMany).not.toHaveBeenCalled();
  });
});
