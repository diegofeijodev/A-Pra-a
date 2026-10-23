/**
 * Lote D da Lovable, L8 (contrato §40): shoppings — flag desligada (404 e a busca de hoje intacta), chave do cache por `kind`,
 * busca de shoppings com as métricas do polígono (fixture do dry-run, nunca o Overpass real), lojas dentro do polígono com o raio
 * de reserva, "adicionar como leads", a lista com o critério e a marcação à mão, e o shopping fora da cadência automática.
 */
import 'reflect-metadata';
import { BadRequestException, Logger, ValidationPipe } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { AuthUser } from '../../../common/auth/auth-user';
import type { PrismaService } from '../../../common/database/prisma.service';
import { flattenErrors } from '../../../common/validation/flatten-errors';
import { chaveCache } from '../../../domain/places-rules';
import { CONFIG_SHOPPING } from '../../../domain/shopping-rules';
import type { ImportsService } from '../../imports/imports.service';
import type { FlagsLovableC, FlagsLovableD } from '../../rotas/rotas.tokens';
import { StartPlaceSearchDto } from '../dto/places.dto';
import { PlacesSearchService } from '../places-search.service';
import { PlacesSegmentsService } from '../places-segments.service';
import { OverpassProvider } from '../providers/overpass.provider';
import type { BuscaParams, PlacesProvider } from '../providers/places-provider';
import { ShoppingsService } from '../shoppings.service';

beforeAll(() => Logger.overrideLogger(false));

const PRACA = '00000000-0000-4000-8000-0000000000aa';
const AREA = '00000000-0000-4000-8000-0000000000cc';
const MALL = '33333333-3333-4333-8333-333333333333';
const ADMIN: AuthUser = { id: '00000000-0000-4000-8000-0000000000ee', email: 'a@a.com', name: 'A', is_admin: true };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const FIXTURE = require('./fixtures/overpass-shoppings-bh.json') as { elements: unknown[] };

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  exceptionFactory: (errors) => new BadRequestException({ code: 'VALIDATION_ERROR', message: flattenErrors(errors) }),
});
async function mensagem(body: unknown): Promise<string | null> {
  try {
    await pipe.transform(body, { type: 'body', metatype: StartPlaceSearchDto });
    return null;
  } catch (e) {
    return ((e as BadRequestException).getResponse() as { message: string }).message;
  }
}

function montar(o: { malls: boolean; shopping?: Record<string, unknown> | null; metricas?: Record<string, unknown> | null; lugares?: unknown[] }) {
  const flagsC: FlagsLovableC = { segments: o.malls, vouchers: false, voucher_coupons: false };
  const flagsD: FlagsLovableD = { route_plans: o.malls, malls: o.malls };
  const buscar = jest.fn(async (p: BuscaParams) => {
    p.onAlvo?.('area');
    return (o.lugares ?? []) as never[];
  });
  const osm: PlacesProvider = { id: 'osm', disponivel: () => true, buscar };
  const apify: PlacesProvider = { id: 'apify', disponivel: () => false, buscar: jest.fn() };
  const criado: Record<string, unknown>[] = [];
  const candidatos: Record<string, unknown>[] = [];
  const prisma: Record<string, unknown> = {
    app_settings: { findUnique: jest.fn(async () => ({ field_config: {}, place_segments: null })) },
    pracas: { findUnique: jest.fn(async () => ({ id: PRACA, name: 'BH', lat: -19.9191, lon: -43.9386 })) },
    field_areas: {
      findFirst: jest.fn(async () => ({ id: AREA, praca_id: PRACA, name: 'Centro', lat: -19.92, lng: -43.94, radius_m: 1500, active: true })),
    },
    leads: {
      findMany: jest.fn(async () => []),
      findFirst: jest.fn(async () => (o.shopping === undefined ? { id: MALL, name: 'BH Shopping', lat: -19.977, lng: -43.946, mall_metrics: o.metricas ?? null } : o.shopping)),
    },
    lead_mall_metrics: {
      findUnique: jest.fn(async () => o.metricas ?? null),
      updateMany: jest.fn(async () => ({ count: 1 })),
      createMany: jest.fn(async () => ({ count: 1 })),
    },
    place_import_runs: {
      findFirst: jest.fn(async () => null),
      findMany: jest.fn(async () => []),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        criado.push(data);
        return { id: 'r1', status: 'queued', found: 0, novos: 0, duplicados: 0, descartados: 0, truncated: false, est_cost_usd: 0, error: null, created_at: new Date(), started_at: null, finished_at: null, ...data };
      }),
      updateMany: jest.fn(async () => ({ count: 1 })),
      findUniqueOrThrow: jest.fn(async () => ({ id: 'r1', ...criado[criado.length - 1], status: 'running' })),
    },
    place_candidates: {
      createMany: jest.fn(async ({ data }: { data: Record<string, unknown>[] }) => {
        candidatos.push(...data);
        return { count: data.length };
      }),
    },
    $transaction: jest.fn(async (fn: (tx: unknown) => unknown): Promise<unknown> => fn(prisma)),
  };
  const segmentos = new PlacesSegmentsService(prisma as unknown as PrismaService, flagsC);
  const service = new PlacesSearchService(
    prisma as unknown as PrismaService,
    {} as ImportsService,
    { osm, apify },
    { apifyMaxPerRun: 300, apifyMonthlyCap: 3000 },
    segmentos,
    flagsD,
  );
  return { service, prisma, buscar, criado, candidatos };
}

describe('flag desligada (FIELD_MALLS_ENABLED=false)', () => {
  it('kind shoppings/lojas = 404 MALLS_DISABLED antes de tudo; kind ausente = a busca de hoje (o provedor não recebe modo)', async () => {
    const { service, buscar, criado, prisma } = montar({ malls: false });
    for (const kind of ['shoppings', 'lojas']) {
      await expect(service.start({ praca_id: PRACA, area_id: AREA, types: ['bar'], kind } as StartPlaceSearchDto, ADMIN)).rejects.toMatchObject({
        status: 404,
        response: { code: 'MALLS_DISABLED' },
      });
    }
    expect(criado).toHaveLength(0);
    await service.start({ praca_id: PRACA, area_id: AREA, types: ['bar'] }, ADMIN);
    await service.aguardarFila();
    expect(criado[0]).not.toHaveProperty('kind');
    expect(buscar.mock.calls[0]![0]).not.toHaveProperty('modo');
    expect(buscar.mock.calls[0]![0]).not.toHaveProperty('onAlvo');
    await service.list(PRACA);
    expect((prisma.place_import_runs as { findMany: jest.Mock }).findMany.mock.calls[0][0].where).toEqual({ praca_id: PRACA });
  });

  it('DTO: o corpo de hoje valida igual (kind ausente ou nulo); kind só aceita lugares|shoppings|lojas', async () => {
    delete process.env.FIELD_SEGMENTS_ENABLED;
    expect(await mensagem({ praca_id: PRACA, area_id: AREA, types: ['bar'] })).toBeNull();
    expect(await mensagem({ praca_id: PRACA, area_id: AREA, types: ['bar'], kind: null, radius_m: null, parent_lead_id: null })).toBeNull();
    expect(await mensagem({ praca_id: PRACA, types: ['bar'] })).toMatch(/area_id/);
    expect(await mensagem({ praca_id: PRACA, area_id: AREA })).toMatch(/types/);
    expect(await mensagem({ praca_id: PRACA, area_id: AREA, types: ['bar'], kind: 'mercados' })).toMatch(/kind/);
    // Shoppings sem área nem tipos passam no DTO (o serviço decide o 404 com a flag desligada).
    expect(await mensagem({ praca_id: PRACA, kind: 'shoppings' })).toBeNull();
    expect(await mensagem({ praca_id: PRACA, kind: 'shoppings', radius_m: 40000 })).toMatch(/radius_m/);
  });

  it('as rotas dos shoppings respondem 404 MALLS_DISABLED', async () => {
    const s = new ShoppingsService({} as PrismaService, { route_plans: true, malls: false });
    for (const f of [() => s.config(), () => s.list({ praca_id: PRACA }), () => s.marcar(MALL, { large_override: true }, ADMIN), () => s.salvarConfig({})]) {
      await expect(f()).rejects.toMatchObject({ status: 404, response: { code: 'MALLS_DISABLED' } });
    }
  });
});

describe('chave do cache por kind', () => {
  it('lugares (ou ausente) = a fórmula de hoje; shoppings e lojas (por shopping) ganham chave própria', () => {
    const p = { source: 'osm', lat: -19.9, lng: -43.9, radius_m: 15000, types: [] as string[] };
    const hoje = createHash('sha256').update(JSON.stringify(['osm', -19.9, -43.9, 15000, []])).digest('hex').slice(0, 40);
    expect(chaveCache(p)).toBe(hoje);
    expect(chaveCache({ ...p, kind: 'lugares' })).toBe(hoje);
    const shop = chaveCache({ ...p, kind: 'shoppings' });
    expect(shop).not.toBe(hoje);
    expect(chaveCache({ ...p, kind: 'lojas', parent_lead_id: MALL })).not.toBe(chaveCache({ ...p, kind: 'lojas', parent_lead_id: AREA }));
  });
});

describe('busca de shoppings (flag ligada)', () => {
  it('centro da praça (sem área), 15 km, sem tipos, só OSM; o provedor recebe o modo shoppings e as métricas vão para o candidato', async () => {
    const lugares = [
      { name: 'BH Shopping', category: 'shopping', address: '', lat: -19.977, lng: -43.946, location_precision: 'point', phone: '', website: null, source: 'osm', source_ref: 'way/8066207', closed: false, metrics: { geometry_kind: 'poligono', area_m2: 49331, levels: 4 } },
    ];
    const { service, buscar, criado, candidatos } = montar({ malls: true, lugares });
    const { run } = await service.start({ praca_id: PRACA, kind: 'shoppings' } as StartPlaceSearchDto, ADMIN);
    await service.aguardarFila();
    expect(criado[0]).toMatchObject({ kind: 'shoppings', area_id: null, area_name: 'BH', radius_m: 15000, types: [], source: 'osm', lat: -19.9191, lng: -43.9386 });
    expect(run).toMatchObject({ kind: 'shoppings', parent_lead_id: null, area_id: null });
    expect(buscar.mock.calls[0]![0].modo).toEqual({ kind: 'shoppings' });
    expect(candidatos[0]).toMatchObject({ category: 'shopping', metrics: { geometry_kind: 'poligono', area_m2: 49331 } });
    await expect(service.start({ praca_id: PRACA, kind: 'shoppings', source: 'apify' } as StartPlaceSearchDto, ADMIN)).rejects.toMatchObject({ status: 400 });
  });

  it('Overpass com a fixture do dry-run (sem rede): a consulta tem out geom e as métricas saem do polígono', async () => {
    const corpos: string[] = [];
    const prov = new OverpassProvider({
      url: 'http://overpass.invalido',
      userAgent: 'teste',
      fetch: (async (_u: string, init: RequestInit) => {
        corpos.push(decodeURIComponent(String(init.body).slice(5)));
        return new Response(JSON.stringify(FIXTURE), { status: 200 });
      }) as never,
      sleep: async () => undefined,
      minIntervalMs: 0,
    });
    const r = await prov.buscar({ centro: { lat: -19.9191, lng: -43.9386 }, raio_m: 50000, types: [], modo: { kind: 'shoppings' }, limite: 301, signal: new AbortController().signal });
    expect(corpos[0]).toContain('nwr["shop"="mall"](around:50000,-19.9191,-43.9386);');
    expect(corpos[0]).toContain('out geom');
    const bh = r.find((x) => x.name === 'BH Shopping')!;
    expect(bh).toMatchObject({ category: 'shopping', source_ref: 'way/8066207', metrics: { geometry_kind: 'poligono', levels: 4 } });
    expect((bh.metrics as { area_m2: number }).area_m2).toBeGreaterThan(45_000);
  });
});

describe('lojas dentro do shopping (flag ligada)', () => {
  it('polígono: map_to_area do way; o raio de corte alcança o shopping inteiro; a contagem vira pois_mapped', async () => {
    const metricas = { lead_id: MALL, source_ref: 'way/8066207', geometry_kind: 'poligono', area_m2: 49331, levels: 4, pois_mapped: null, large_override: null, measured_at: new Date() };
    const lugares = [{ name: 'Bar X', category: 'bar', address: '', lat: -19.977, lng: -43.946, location_precision: 'point', phone: '', website: null, source: 'osm', source_ref: 'node/1', closed: false }];
    const { service, buscar, criado, prisma } = montar({ malls: true, metricas, lugares });
    await service.start({ praca_id: PRACA, kind: 'lojas', parent_lead_id: MALL, types: ['bar'] } as StartPlaceSearchDto, ADMIN);
    await service.aguardarFila();
    expect(criado[0]).toMatchObject({ kind: 'lojas', parent_lead_id: MALL, area_id: null, area_name: 'BH Shopping', types: ['bar'] });
    expect(criado[0]!.radius_m).toBe(Math.ceil(1.5 * Math.sqrt(49331)));
    expect(buscar.mock.calls[0]![0].modo).toEqual({
      kind: 'lojas',
      alvo: { tipo: 'area', source_ref: 'way/8066207' },
      reserva: { centro: { lat: -19.977, lng: -43.946 }, raio_m: 300 },
    });
    expect((prisma.lead_mall_metrics as { updateMany: jest.Mock }).updateMany).toHaveBeenCalledWith({
      where: { lead_id: MALL },
      data: { pois_mapped: 1, measured_at: expect.any(Date) },
    });
  });

  it('Overpass: o polígono sem resultado cai para o raio em volta (menos confiável)', async () => {
    const corpos: string[] = [];
    let n = 0;
    const prov = new OverpassProvider({
      url: 'http://overpass.invalido',
      userAgent: 'teste',
      fetch: (async (_u: string, init: RequestInit) => {
        corpos.push(decodeURIComponent(String(init.body).slice(5)));
        n += 1;
        const elements = n === 1 ? [] : [{ type: 'node', id: 7, lat: -19.9, lon: -43.9, tags: { amenity: 'bar', name: 'Bar do Shopping' } }];
        return new Response(JSON.stringify({ elements }), { status: 200 });
      }) as never,
      sleep: async () => undefined,
      minIntervalMs: 0,
    });
    const alvos: string[] = [];
    const seg = (await import('../../../domain/segmentos-rules')).SEGMENTOS_PADRAO.filter((s) => s.slug === 'bar');
    const r = await prov.buscar({
      centro: { lat: -19.9, lng: -43.9 },
      raio_m: 333,
      types: [],
      segmentos: seg,
      modo: { kind: 'lojas', alvo: { tipo: 'area', source_ref: 'relation/9' }, reserva: { centro: { lat: -19.9, lng: -43.9 }, raio_m: 300 } },
      onAlvo: (t) => alvos.push(t),
      limite: 301,
      signal: new AbortController().signal,
    });
    expect(corpos[0]).toContain('relation(9);map_to_area->.shop;');
    expect(corpos[1]).toContain('(around:300,-19.9,-43.9)');
    expect(alvos).toEqual(['raio']);
    expect(r.map((x) => x.name)).toEqual(['Bar do Shopping']);
  });

  it('shopping de outra praça (ou que não é shopping) = 404; sem localização = 422', async () => {
    const a = montar({ malls: true, shopping: null });
    await expect(a.service.start({ praca_id: PRACA, kind: 'lojas', parent_lead_id: MALL, types: ['bar'] } as StartPlaceSearchDto, ADMIN)).rejects.toMatchObject({ status: 404 });
    const b = montar({ malls: true, shopping: { id: MALL, name: 'X', lat: null, lng: null, mall_metrics: null } });
    await expect(b.service.start({ praca_id: PRACA, kind: 'lojas', parent_lead_id: MALL, types: ['bar'] } as StartPlaceSearchDto, ADMIN)).rejects.toMatchObject({ status: 422 });
  });
});

describe('lista com o critério e a marcação à mão', () => {
  function shoppings(linhas: Record<string, unknown>[], config: Record<string, unknown> = {}) {
    const upsert = jest.fn(async () => ({}));
    const prisma = {
      app_settings: { findUnique: jest.fn(async () => ({ field_config: { shopping: config } })) },
      pracas: { findUnique: jest.fn(async () => ({ id: PRACA })) },
      leads: {
        findMany: jest.fn(async () => linhas),
        findFirst: jest.fn(async () => ({ id: MALL, source_ref: 'way/1' })),
        findUniqueOrThrow: jest.fn(async () => linhas[0]),
      },
      lead_mall_metrics: { upsert },
    };
    return { s: new ShoppingsService(prisma as unknown as PrismaService, { route_plans: true, malls: true }), prisma, upsert };
  }
  const linha = (nome: string, area: number | null, over: Record<string, unknown> = {}) => ({
    id: `${nome}-id`,
    name: nome,
    address: '',
    lat: -19.9,
    lng: -43.9,
    source_ref: 'way/1',
    _count: { stores: 3 },
    mall_metrics: { source_ref: 'way/1', geometry_kind: area === null ? 'ponto' : 'poligono', area_m2: area, levels: null, pois_mapped: null, large_override: null, measured_at: new Date('2026-10-22T12:00:00Z'), ...over },
  });

  it('grandes primeiro, com a conta; à mão vale mais que a área; a configuração da tela muda o critério', async () => {
    const { s } = shoppings([linha('Pátio Savassi', 8497), linha('BH Shopping', 49331), linha('Diamond', 12681, { large_override: true }), linha('Galeria', null)]);
    const r = await s.list({ praca_id: PRACA });
    expect(r.config).toEqual(CONFIG_SHOPPING.padrao);
    expect(r.shoppings.map((x) => [x.name, x.is_large, x.por])).toEqual([
      ['BH Shopping', true, 'criterio'],
      ['Diamond', true, 'manual'],
      ['Pátio Savassi', false, 'criterio'],
      ['Galeria', false, 'criterio'],
    ]);
    expect(r.shoppings[0]!.conta).toBe('Área no mapa aberto: 49.331 m² (mínimo 20.000 m²) → grande.');
    expect(r.shoppings[0]!.stores).toBe(3);
    const { s: s2 } = shoppings([linha('Pátio Savassi', 8497)], { area_min_m2: 8000 });
    expect((await s2.list({ praca_id: PRACA })).shoppings[0]!.is_large).toBe(true);
  });

  it('PATCH grava a marcação (null volta ao critério) com quem marcou', async () => {
    const { s, upsert } = shoppings([linha('Pátio Savassi', 8497, { large_override: true })]);
    const v = await s.marcar(MALL, { large_override: true }, ADMIN);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { lead_id: MALL }, update: { large_override: true, updated_by: ADMIN.id } }));
    expect(v).toMatchObject({ is_large: true, por: 'manual' });
    await expect(s.marcar('x', { large_override: null }, ADMIN)).rejects.toMatchObject({ status: 404 });
  });
});

describe('"Adicionar como leads" das buscas de shoppings e de lojas', () => {
  function adicionar(kind: 'shoppings' | 'lojas' | 'lugares') {
    const cand = {
      id: '11111111-1111-4111-8111-111111111111',
      run_id: 'r1',
      status: 'novo',
      source: 'osm',
      source_ref: 'way/8066207',
      name: 'BH Shopping',
      category: kind === 'shoppings' ? 'shopping' : 'bar',
      address: '',
      lat: -19.977,
      lng: -43.946,
      location_precision: 'point',
      phone: '',
      website: null,
      reason: null,
      lead_id: null,
      metrics: kind === 'shoppings' ? { geometry_kind: 'poligono', area_m2: 49331.4, levels: 4 } : null,
    };
    const criarLeadsDeBusca = jest.fn(async () => ({ batch_id: 'b1', leads: [{ source_ref: 'way/8066207', lead_id: 'novo-lead' }] }));
    const createMany = jest.fn(async () => ({ count: 1 }));
    const tx = {
      place_candidates: { findMany: jest.fn(async () => [cand]), updateMany: jest.fn(async () => ({ count: 1 })), update: jest.fn(async () => ({})) },
      leads: { findMany: jest.fn(async () => []) },
      lead_mall_metrics: { createMany },
    };
    const run = { id: 'r1', praca_id: PRACA, status: 'done', area_name: 'BH', source: 'osm', kind, parent_lead_id: kind === 'lojas' ? MALL : null };
    const prisma = {
      place_import_runs: { findFirst: jest.fn(async () => run) },
      $transaction: jest.fn(async (fn: (t: unknown) => unknown) => fn(tx)),
    };
    const service = new PlacesSearchService(
      prisma as unknown as PrismaService,
      { criarLeadsDeBusca } as unknown as ImportsService,
      { osm: { id: 'osm', disponivel: () => true, buscar: jest.fn() }, apify: { id: 'apify', disponivel: () => false, buscar: jest.fn() } },
      { apifyMaxPerRun: 300, apifyMonthlyCap: 3000 },
      undefined,
      { route_plans: true, malls: true },
    );
    return { service, criarLeadsDeBusca, createMany, cand };
  }
  const R1 = '22222222-2222-4222-8222-222222222222';

  it('shoppings: o lead nasce com place_kind e as métricas do polígono (área arredondada)', async () => {
    const { service, criarLeadsDeBusca, createMany, cand } = adicionar('shoppings');
    await service.addLeads(R1, { praca_id: PRACA, candidate_ids: [cand.id] }, ADMIN);
    expect((criarLeadsDeBusca.mock.calls[0] as unknown[])[1]).toMatchObject({ itens: [{ source_ref: 'way/8066207', place_kind: 'shopping' }] });
    expect(createMany).toHaveBeenCalledWith({
      data: [{ lead_id: 'novo-lead', source_ref: 'way/8066207', geometry_kind: 'poligono', area_m2: 49331, levels: 4, measured_at: expect.any(Date) }],
      skipDuplicates: true,
    });
  });
  it('lojas: o lead aponta para o shopping; lugares: nada novo no lead', async () => {
    const a = adicionar('lojas');
    await a.service.addLeads(R1, { praca_id: PRACA, candidate_ids: [a.cand.id] }, ADMIN);
    expect((a.criarLeadsDeBusca.mock.calls[0] as unknown[])[1]).toMatchObject({ itens: [{ parent_lead_id: MALL }] });
    expect(a.createMany).not.toHaveBeenCalled();
    const b = adicionar('lugares');
    await b.service.addLeads(R1, { praca_id: PRACA, candidate_ids: [b.cand.id] }, ADMIN);
    const item = ((b.criarLeadsDeBusca.mock.calls[0] as unknown[])[1] as { itens: Record<string, unknown>[] }).itens[0]!;
    expect(Object.keys(item)).toEqual(['name', 'address', 'phone', 'site', 'lat', 'lng', 'location_precision', 'source', 'source_ref']);
  });
});
