/**
 * Lote D da Lovable, L7 (contrato §39): planos de rota — flag desligada (404), divisão determinística, elegíveis com as regras dos
 * candidatos, praça A × B, publicação pelo MESMO serviço do `POST /v1/routes` (ROUTE_EXISTS, confirm_replace, idempotência,
 * LEAD_IN_OTHER_ROUTE) e "Minhas rotas" do próprio consultor.
 */
import 'reflect-metadata';
import { ConflictException } from '@nestjs/common';
import type { AuthUser } from '../../../common/auth/auth-user';
import type { PrismaService } from '../../../common/database/prisma.service';
import { ADMIN_ONLY_KEY } from '../../../common/decorators/admin-only.decorator';
import { CAMPO_ROUTE_KEY } from '../../../common/decorators/campo-route.decorator';
import { CONFIG_ROTA_PADRAO } from '../../../domain/rota-rules';
import { MinhasRotasController, PlanosController } from '../planos/planos.controller';
import { PlanosService } from '../planos/planos.service';
import type { RotasConfigService } from '../rotas-config.service';
import type { RotasEquipeService } from '../rotas-equipe.service';
import { AGORA, CONS_A, CONS_B, DIA, LEAD, PRACA, PRACA_B, ROTA, rotaRow } from './fixtures';

const ADMIN: AuthUser = { id: '00000000-0000-4000-8000-0000000000dd', email: 'a@a.com', name: 'A', is_admin: true };
const PLANO = '88888888-8888-4888-8888-888888888888';
const ITEM = '88888888-8888-4888-8888-000000000001';
const AREA = '00000000-0000-4000-8000-0000000000cc';
const falha = async (f: () => Promise<unknown>) => f().then(() => null, (e: unknown) => e);
const codigo = (e: unknown) => ((e as { getResponse: () => { code: string } }).getResponse() as { code: string }).code;
const status = (e: unknown) => (e as { getStatus: () => number }).getStatus();

const leadGeo = (n: number) => ({ id: LEAD(n), lat: -19.92 + (n % 5) * 0.002, lng: -43.94 + Math.floor(n / 5) * 0.002 });

function fake() {
  const planos: Record<string, unknown>[] = [];
  const itens: Record<string, unknown>[] = [];
  return {
    planos,
    itens,
    app_settings: { findUnique: jest.fn().mockResolvedValue({ field_config: {} }), upsert: jest.fn() },
    pracas: { findUnique: jest.fn().mockImplementation(async ({ where }: { where: { id: string } }) => ([PRACA, PRACA_B].includes(where.id) ? { id: where.id, lat: -19.92, lon: -43.94 } : null)) },
    field_areas: {
      findFirst: jest.fn().mockImplementation(async ({ where }: { where: { id: string; praca_id: string } }) =>
        where.id === AREA && where.praca_id === PRACA ? { id: AREA, praca_id: PRACA, lat: -19.92, lng: -43.94, radius_m: 3000 } : null,
      ),
      findMany: jest.fn().mockResolvedValue([{ id: AREA, name: 'Centro', praca_id: PRACA, lat: -19.92, lng: -43.94, radius_m: 3000 }]),
    },
    leads: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
    field_consultants: {
      findUnique: jest.fn().mockImplementation(async ({ where }: { where: { id: string } }) =>
        where.id === CONS_A ? { id: CONS_A, name: 'Ana', praca_id: PRACA } : where.id === CONS_B ? { id: CONS_B, name: 'Bia', praca_id: PRACA_B } : null,
      ),
    },
    field_routes: { findFirst: jest.fn().mockResolvedValue(null), findUnique: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
    field_route_plans: {
      create: jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
        const p = { id: PLANO, archived_at: null, archived_by: null, ...data };
        planos.push(p);
        return p;
      }),
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    field_route_plan_items: {
      createMany: jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown>[] }) => {
        itens.push(...data);
        return { count: data.length };
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: jest.fn(),
  };
}

function montar(p: ReturnType<typeof fake>, flags = { route_plans: true, malls: false }) {
  p.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(p));
  const configs = { config: jest.fn().mockResolvedValue(CONFIG_ROTA_PADRAO) } as unknown as RotasConfigService;
  const rotas = {
    build: jest.fn().mockResolvedValue({ id: ROTA, consultant_id: CONS_A, day: DIA, stops: [] }),
    get: jest.fn().mockResolvedValue({ id: ROTA, consultant_id: CONS_A, day: DIA, stops: [] }),
  };
  const s = new PlanosService(p as unknown as PrismaService, configs, rotas as unknown as RotasEquipeService, flags);
  return { s, rotas };
}

/** Plano gravado com um item (para get/atribuir). */
function planoGravado(p: ReturnType<typeof fake>, item: Record<string, unknown> = {}, plano: Record<string, unknown> = {}) {
  const it = {
    id: ITEM,
    plan_id: PLANO,
    seq: 1,
    name: 'Rota 01',
    color: '#2563eb',
    lead_ids: [LEAD(1), LEAD(2)],
    distance_m: 300,
    est_minutes: 101,
    assigned_route_id: null,
    assigned_consultant_id: null,
    assigned_day: null,
    assigned_at: null,
    assigned_by: null,
    consultant: null,
    ...item,
  };
  const pl = {
    id: PLANO,
    praca_id: PRACA,
    area_id: null,
    kind: 'geral',
    parent_lead_id: null,
    travel_mode: 'carro',
    modelo_tempo: 'lovable',
    params_snapshot: {},
    total_leads: 2,
    truncated: false,
    created_by: ADMIN.id,
    created_at: AGORA,
    archived_at: null,
    archived_by: null,
    ...plano,
    items: [it],
  };
  p.field_route_plans.findUnique.mockResolvedValue(pl);
  return { pl, it };
}

describe('flag desligada (FIELD_ROUTE_PLANS_ENABLED=false)', () => {
  it('todas as rotas respondem 404 ROUTE_PLANS_DISABLED, sem tocar no banco', async () => {
    const p = fake();
    const { s, rotas } = montar(p, { route_plans: false, malls: false });
    const chamadas = [
      () => s.config(),
      () => s.salvarConfig({ por_rota: 10 }),
      () => s.list({ praca_id: PRACA }),
      () => s.criar({ praca_id: PRACA }, ADMIN, AGORA),
      () => s.get(PLANO),
      () => s.atribuir(PLANO, ITEM, { consultant_id: CONS_A, day: DIA }, ADMIN, AGORA),
      () => s.arquivar(PLANO, ADMIN, AGORA),
      () => s.minhasRotas(CONS_A, {}, AGORA),
    ];
    for (const f of chamadas) {
      const e = await falha(f);
      expect([status(e), codigo(e)]).toEqual([404, 'ROUTE_PLANS_DISABLED']);
    }
    expect(p.leads.findMany).not.toHaveBeenCalled();
    expect(p.field_route_plans.findUnique).not.toHaveBeenCalled();
    expect(rotas.build).not.toHaveBeenCalled();
  });
});

describe('criar: elegíveis, determinismo e praça', () => {
  it('sem lead_ids: as regras dos candidatos do §23.4 + fora de roteiro publicado de hoje em diante; sem filtro de shopping com a flag dela desligada', async () => {
    const p = fake();
    p.leads.findMany
      .mockResolvedValueOnce([leadGeo(1), leadGeo(2), leadGeo(3)])
      .mockResolvedValue([1, 2, 3].map((n) => ({ ...leadGeo(n), name: `Bar ${n}`, address: `Rua ${n}, 10 - Savassi` })));
    const { s } = montar(p);
    p.field_route_plans.findUnique.mockImplementation(async () => ({ ...p.planos[0], items: p.itens.map((i, k) => ({ ...i, id: `i${k}`, consultant: null, assigned_at: null })) }));
    const v = await s.criar({ praca_id: PRACA, area_id: AREA }, ADMIN, AGORA);
    const where = p.leads.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({
      praca_id: PRACA,
      archived: false,
      is_test: false,
      stage: { lte: CONFIG_ROTA_PADRAO.estagio_maximo_rota },
      declared_signups: { none: { void: null } },
      location_precision: { in: ['point', 'address'] },
      route_stops: { none: { day: { gte: DIA }, status: { in: ['pendente', 'visitada', 'adiada'] } } },
    });
    expect(where).not.toHaveProperty('place_kind');
    expect(v.items.flatMap((i) => i.lead_ids).sort()).toEqual([LEAD(1), LEAD(2), LEAD(3)].sort());
    expect(p.planos[0]).toMatchObject({ kind: 'geral', travel_mode: 'carro', modelo_tempo: 'lovable', total_leads: 3, area_id: AREA });
    expect(v.items[0]).toMatchObject({ name: 'Rota 01', color: '#2563eb', bairro_principal: 'Savassi' });
    expect(v.items[0]!.conta_lovable.texto).toMatch(/^3 × 20 min \+ 1 h de intervalo/);
    expect(v.items[0]!.conta_roteiro.texto).toMatch(/^3 × 8 min/);
  });

  it('determinístico: a mesma entrada em outra ordem gera os mesmos itens', async () => {
    const geo = Array.from({ length: 45 }, (_, n) => leadGeo(n + 1));
    const p1 = fake();
    p1.leads.findMany.mockResolvedValue(geo);
    const p2 = fake();
    p2.leads.findMany.mockResolvedValue([...geo].reverse());
    for (const p of [p1, p2]) {
      p.field_route_plans.findUnique.mockImplementation(async () => ({ ...p.planos[0], items: [] }));
      await montar(p).s.criar({ praca_id: PRACA, por_rota: 8 }, ADMIN, AGORA);
    }
    expect(p1.itens.map((i) => i.lead_ids)).toEqual(p2.itens.map((i) => i.lead_ids));
    expect(p1.itens.every((i) => (i.lead_ids as string[]).length <= 8)).toBe(true);
  });

  it('praça A × B: lead de outra praça = 400 (mesma resposta de inexistente); nenhum elegível = 422 PLAN_NO_LEADS', async () => {
    const p = fake();
    p.leads.findMany.mockResolvedValue([{ ...leadGeo(1), praca_id: PRACA_B, archived: false, name: 'X' }]);
    const e = await falha(() => montar(p).s.criar({ praca_id: PRACA, lead_ids: [LEAD(1)] }, ADMIN, AGORA));
    expect([status(e), codigo(e)]).toEqual([400, 'VALIDATION_ERROR']);
    const q = fake();
    const e2 = await falha(() => montar(q).s.criar({ praca_id: PRACA }, ADMIN, AGORA));
    expect([status(e2), codigo(e2)]).toEqual([422, 'PLAN_NO_LEADS']);
    const e3 = await falha(() => montar(q).s.criar({ praca_id: PRACA, area_id: '00000000-0000-4000-8000-0000000000ee' }, ADMIN, AGORA));
    expect(status(e3)).toBe(404);
  });

  it('planos de shopping com FIELD_MALLS_ENABLED desligada = 404 MALLS_DISABLED', async () => {
    const p = fake();
    for (const kind of ['shoppings', 'shopping_interno']) {
      const e = await falha(() => montar(p).s.criar({ praca_id: PRACA, kind }, ADMIN, AGORA));
      expect([status(e), codigo(e)]).toEqual([404, 'MALLS_DISABLED']);
    }
  });

  it('com os shoppings ligados e fora_da_rota_geral (padrão), o plano geral deixa shoppings e lojas de fora', async () => {
    const p = fake();
    p.leads.findMany.mockResolvedValue([leadGeo(1)]);
    p.field_route_plans.findUnique.mockImplementation(async () => ({ ...p.planos[0], items: [] }));
    await montar(p, { route_plans: true, malls: true }).s.criar({ praca_id: PRACA }, ADMIN, AGORA);
    expect(p.leads.findMany.mock.calls[0][0].where).toMatchObject({ place_kind: null, parent_lead_id: null });
  });
});

describe('planos dos shoppings (L8, flag ligada)', () => {
  it('rota dos shoppings: só os grandes pelo critério (à mão vale mais), todos numa rota até o teto de tempo', async () => {
    const p = fake();
    const shopping = (n: number, area: number | null, over: Record<string, unknown> = {}) => ({
      ...leadGeo(n),
      mall_metrics: { geometry_kind: area === null ? 'ponto' : 'poligono', area_m2: area, levels: null, pois_mapped: null, large_override: null, ...over },
    });
    p.leads.findMany.mockResolvedValueOnce([shopping(1, 49331), shopping(2, 8497), shopping(3, 8497, { large_override: true }), shopping(4, null)]);
    p.field_route_plans.findUnique.mockImplementation(async () => ({ ...p.planos[0], items: [] }));
    await montar(p, { route_plans: true, malls: true }).s.criar({ praca_id: PRACA, kind: 'shoppings', por_rota: 2 }, ADMIN, AGORA);
    expect(p.leads.findMany.mock.calls[0][0].where).toMatchObject({ praca_id: PRACA, place_kind: 'shopping', archived: false });
    expect(p.itens.flatMap((i) => i.lead_ids as string[]).sort()).toEqual([LEAD(1), LEAD(3)].sort());
    expect(p.itens).toHaveLength(1);
    expect(p.itens[0]).toMatchObject({ name: 'Rota dos shoppings' });
  });
  it('rota interna: exige o shopping da praça; as lojas de dentro numa rota "Dentro do X"', async () => {
    const p = fake();
    const { s } = montar(p, { route_plans: true, malls: true });
    expect(status(await falha(() => s.criar({ praca_id: PRACA, kind: 'shopping_interno' }, ADMIN, AGORA)))).toBe(400);
    expect(status(await falha(() => s.criar({ praca_id: PRACA, kind: 'shopping_interno', parent_lead_id: LEAD(9) }, ADMIN, AGORA)))).toBe(404);
    p.leads.findFirst.mockResolvedValue({ id: LEAD(9), name: 'BH Shopping' });
    p.leads.findMany.mockResolvedValueOnce([leadGeo(1), leadGeo(2)]);
    p.field_route_plans.findUnique.mockImplementation(async () => ({ ...p.planos[0], items: [] }));
    await s.criar({ praca_id: PRACA, kind: 'shopping_interno', parent_lead_id: LEAD(9) }, ADMIN, AGORA);
    expect(p.leads.findFirst.mock.calls.at(-1)[0].where).toEqual({ id: LEAD(9), praca_id: PRACA, place_kind: 'shopping' });
    expect(p.leads.findMany.mock.calls[0][0].where).toMatchObject({ parent_lead_id: LEAD(9), praca_id: PRACA });
    expect(p.itens[0]).toMatchObject({ name: 'Dentro do BH Shopping' });
    expect(p.planos[0]).toMatchObject({ kind: 'shopping_interno', parent_lead_id: LEAD(9) });
  });
});

describe('atribuir: mesmo serviço do POST /v1/routes', () => {
  it('consultor com roteiro ativo no dia e sem confirm_replace = 409 ROUTE_EXISTS; com confirm_replace chama o build com a rota', async () => {
    const p = fake();
    planoGravado(p);
    p.field_routes.findFirst.mockResolvedValue({ id: ROTA });
    p.leads.findMany.mockResolvedValue([{ id: LEAD(2) }, { id: LEAD(1) }]);
    const { s, rotas } = montar(p);
    const e = await falha(() => s.atribuir(PLANO, ITEM, { consultant_id: CONS_A, day: DIA }, ADMIN, AGORA));
    expect([status(e), codigo(e)]).toEqual([409, 'ROUTE_EXISTS']);
    expect((e as ConflictException).message).toContain('Ana já tem roteiro em ter 20/10');
    expect(rotas.build).not.toHaveBeenCalled();
    const r = await s.atribuir(PLANO, ITEM, { consultant_id: CONS_A, day: DIA, confirm_replace: true }, ADMIN, AGORA);
    expect(rotas.build).toHaveBeenCalledWith({ consultant_id: CONS_A, day: DIA, lead_ids: [LEAD(1), LEAD(2)], travel_mode: 'carro' }, ADMIN, AGORA);
    expect(p.field_route_plan_items.updateMany).toHaveBeenCalledWith({
      where: { id: ITEM, assigned_at: null },
      data: { assigned_route_id: ROTA, assigned_consultant_id: CONS_A, assigned_day: DIA, assigned_at: AGORA, assigned_by: ADMIN.id },
    });
    expect(r.dropped).toBe(0);
  });

  it('idempotente: já publicada para o mesmo consultor e dia devolve o roteiro sem refazer; para outro = 409 ITEM_ALREADY_ASSIGNED', async () => {
    const p = fake();
    planoGravado(p, { assigned_route_id: ROTA, assigned_consultant_id: CONS_A, assigned_day: DIA, assigned_at: AGORA });
    p.field_routes.findUnique.mockResolvedValue({ id: ROTA });
    const { s, rotas } = montar(p);
    await expect(s.atribuir(PLANO, ITEM, { consultant_id: CONS_A, day: DIA }, ADMIN, AGORA)).resolves.toMatchObject({ route: { id: ROTA }, dropped: 0 });
    expect(rotas.build).not.toHaveBeenCalled();
    const e = await falha(() => s.atribuir(PLANO, ITEM, { consultant_id: CONS_A, day: '2026-10-21' }, ADMIN, AGORA));
    expect([status(e), codigo(e)]).toEqual([409, 'ITEM_ALREADY_ASSIGNED']);
  });

  it('praça A × B: consultor de outra praça = 400; plano arquivado = 409 PLAN_ARCHIVED; item inexistente = 404', async () => {
    const p = fake();
    planoGravado(p);
    const { s } = montar(p);
    const e = await falha(() => s.atribuir(PLANO, ITEM, { consultant_id: CONS_B, day: DIA }, ADMIN, AGORA));
    expect([status(e), codigo(e)]).toEqual([400, 'VALIDATION_ERROR']);
    planoGravado(p, {}, { archived_at: AGORA });
    expect(codigo(await falha(() => s.atribuir(PLANO, ITEM, { consultant_id: CONS_A, day: DIA }, ADMIN, AGORA)))).toBe('PLAN_ARCHIVED');
    p.field_route_plans.findUnique.mockResolvedValue({ id: PLANO, items: [] });
    expect(status(await falha(() => s.atribuir(PLANO, ITEM, { consultant_id: CONS_A, day: DIA }, ADMIN, AGORA)))).toBe(404);
    expect(status(await falha(() => s.atribuir('x', ITEM, { consultant_id: CONS_A, day: DIA }, ADMIN, AGORA)))).toBe(404);
  });

  it('o que deixou de poder entrar sai antes (dropped); nada sobrou = 422 PLAN_ITEM_EMPTY', async () => {
    const p = fake();
    planoGravado(p);
    p.leads.findMany.mockResolvedValueOnce([{ id: LEAD(2) }]);
    const { s, rotas } = montar(p);
    const r = await s.atribuir(PLANO, ITEM, { consultant_id: CONS_A, day: DIA }, ADMIN, AGORA);
    expect(rotas.build.mock.calls[0][0].lead_ids).toEqual([LEAD(2)]);
    expect(r.dropped).toBe(1);
    expect(p.leads.findMany.mock.calls[0][0].where).toMatchObject({ praca_id: PRACA, archived: false, lat: { not: null }, lng: { not: null } });
    const q = fake();
    planoGravado(q);
    q.leads.findMany.mockResolvedValue([]);
    expect(codigo(await falha(() => montar(q).s.atribuir(PLANO, ITEM, { consultant_id: CONS_A, day: DIA }, ADMIN, AGORA)))).toBe('PLAN_ITEM_EMPTY');
  });

  it('LEAD_IN_OTHER_ROUTE do índice parcial (via build) chega igual e o item continua livre', async () => {
    const p = fake();
    planoGravado(p);
    p.leads.findMany.mockResolvedValue([{ id: LEAD(1) }, { id: LEAD(2) }]);
    const { s, rotas } = montar(p);
    rotas.build.mockRejectedValue(new ConflictException({ code: 'LEAD_IN_OTHER_ROUTE', message: 'Já estão no roteiro de outro consultor neste dia: Bar 1.' }));
    const e = await falha(() => s.atribuir(PLANO, ITEM, { consultant_id: CONS_A, day: DIA }, ADMIN, AGORA));
    expect([status(e), codigo(e)]).toEqual([409, 'LEAD_IN_OTHER_ROUTE']);
    expect(p.field_route_plan_items.updateMany).not.toHaveBeenCalled();
  });

  it('dois pedidos juntos do mesmo item: o 2º espera o 1º e vê a rota já publicada (o build roda uma vez)', async () => {
    const p = fake();
    const { pl, it } = planoGravado(p);
    p.leads.findMany.mockResolvedValue([{ id: LEAD(1) }, { id: LEAD(2) }]);
    p.field_route_plan_items.updateMany.mockImplementation(async () => {
      Object.assign(it, { assigned_route_id: ROTA, assigned_consultant_id: CONS_A, assigned_day: DIA, assigned_at: AGORA });
      return { count: 1 };
    });
    p.field_route_plans.findUnique.mockImplementation(async () => pl);
    p.field_routes.findUnique.mockResolvedValue({ id: ROTA });
    const { s, rotas } = montar(p);
    const corpo = { consultant_id: CONS_A, day: DIA };
    await Promise.all([s.atribuir(PLANO, ITEM, corpo, ADMIN, AGORA), s.atribuir(PLANO, ITEM, corpo, ADMIN, AGORA)]);
    expect(rotas.build).toHaveBeenCalledTimes(1);
  });
});

describe('arquivar e Minhas rotas', () => {
  it('arquivar é idempotente e não mexe nos roteiros publicados', async () => {
    const p = fake();
    planoGravado(p, { assigned_route_id: ROTA, assigned_at: AGORA, assigned_consultant_id: CONS_A, assigned_day: DIA });
    const { s, rotas } = montar(p);
    await s.arquivar(PLANO, ADMIN, AGORA);
    expect(p.field_route_plans.updateMany).toHaveBeenCalledWith({ where: { id: PLANO, archived_at: null }, data: { archived_at: AGORA, archived_by: ADMIN.id } });
    expect(rotas.build).not.toHaveBeenCalled();
  });

  it('Minhas rotas: só as do próprio consultor, de hoje a +30 por padrão; > 62 dias ou fim antes do começo = 400', async () => {
    const p = fake();
    p.field_routes.findMany.mockResolvedValue([{ ...rotaRow(), plan_items: [{ id: ITEM, plan_id: PLANO, name: 'Rota 01', color: '#2563eb' }] }]);
    const { s } = montar(p);
    const r = await s.minhasRotas(CONS_A, {}, AGORA);
    expect(p.field_routes.findMany.mock.calls[0][0].where).toEqual({ consultant_id: CONS_A, day: { gte: DIA, lte: '2026-11-19' } });
    expect(r.routes[0]).toMatchObject({ id: ROTA, route_plan: { plan_id: PLANO, name: 'Rota 01' } });
    expect(status(await falha(() => s.minhasRotas(CONS_A, { from: DIA, to: '2026-12-22' }, AGORA)))).toBe(400);
    expect(status(await falha(() => s.minhasRotas(CONS_A, { from: DIA, to: '2026-10-19' }, AGORA)))).toBe(400);
  });

  it('controllers: equipe sem @CampoRoute e escrita só admin; Minhas rotas com @CampoRoute', () => {
    expect(Reflect.getMetadata(CAMPO_ROUTE_KEY, PlanosController)).toBeUndefined();
    expect(Reflect.getMetadata(CAMPO_ROUTE_KEY, MinhasRotasController)).toBe(true);
    const marca = (m: string) => Reflect.getMetadata(ADMIN_ONLY_KEY, (PlanosController.prototype as unknown as Record<string, object>)[m]!);
    for (const m of ['salvarConfig', 'criar', 'atribuir', 'arquivar']) expect(marca(m)).toBe(true);
    for (const m of ['config', 'list', 'get']) expect(marca(m)).toBeUndefined();
  });
});

describe('prévia antes de gerar (UX R1)', () => {
  it('a conta dos elegíveis e o mínimo de rotas, com a mesma consulta do criar', async () => {
    const p = fake();
    p.leads.findMany.mockResolvedValue(Array.from({ length: 41 }, (_, n) => leadGeo(n + 1)));
    const r = await montar(p).s.previa({ praca_id: PRACA, por_rota: 20 }, AGORA);
    expect(r).toMatchObject({ lead_count: 41, rotas_min: 3, por_rota: 20, truncated: false });
    expect(r.conta).toBe('41 estabelecimentos com localização exata, fora de roteiro publicado → pelo menos 3 rotas de até 20 paradas (41 ÷ 20 = 2,1; arredonda para cima; o teto de tempo pode criar mais)');
    expect(p.leads.findMany.mock.calls[0][0].where).toMatchObject({ route_stops: { none: { day: { gte: DIA } } } });
    const e = await falha(() => montar(fake(), { route_plans: false, malls: false }).s.previa({ praca_id: PRACA }, AGORA));
    expect(codigo(e)).toBe('ROUTE_PLANS_DISABLED');
  });
});
