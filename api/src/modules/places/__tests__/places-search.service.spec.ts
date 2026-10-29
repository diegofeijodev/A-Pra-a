import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import type { PrismaService } from '../../../common/database/prisma.service';
import { ADMIN_ONLY_KEY } from '../../../common/decorators/admin-only.decorator';
import type { LugarNormalizado } from '../../../domain/places-rules';
import type { ImportsService } from '../../imports/imports.service';
import { PlacesController } from '../places.controller';
import { PlacesSearchService } from '../places-search.service';
import { BuscaCancelada, ProviderError, type BuscaParams, type PlacesProvider } from '../providers/places-provider';

beforeAll(() => Logger.overrideLogger(false));

const PRACA_A = '00000000-0000-4000-8000-0000000000aa';
const PRACA_B = '00000000-0000-4000-8000-0000000000bb';
const AREA = '00000000-0000-4000-8000-0000000000cc';
const RUN = '00000000-0000-4000-8000-0000000000dd';
const C1 = '00000000-0000-4000-8000-000000000001';
const C2 = '00000000-0000-4000-8000-000000000002';
const C3 = '00000000-0000-4000-8000-000000000003';
const ADMIN: AuthUser = { id: '00000000-0000-4000-8000-0000000000ee', email: 'a@a.com', name: 'A', is_admin: true };

const lugar = (over: Partial<LugarNormalizado> = {}): LugarNormalizado => ({
  name: 'Bar do Chico',
  category: 'bar',
  address: 'Av. Ibirapuera, 88',
  lat: -23.6008,
  lng: -46.665,
  location_precision: 'point',
  phone: '',
  website: null,
  source: 'osm',
  source_ref: 'node/1',
  closed: false,
  ...over,
});

const areaRow = (over: Record<string, unknown> = {}) => ({
  id: AREA, praca_id: PRACA_A, name: 'Moema', lat: -23.6003, lng: -46.665, radius_m: 1500, active: true, ...over,
});

const runRow = (over: Record<string, unknown> = {}) => ({
  id: RUN, praca_id: PRACA_A, area_id: AREA, area_name: 'Moema', source: 'osm', types: ['bar'],
  lat: -23.6003, lng: -46.665, radius_m: 1500, cache_key: 'k', status: 'queued', found: 0, novos: 0,
  duplicados: 0, descartados: 0, truncated: false, est_cost_usd: 0, error: null, requested_by: ADMIN.id,
  created_at: new Date('2026-10-19T14:00:00Z'), started_at: null, finished_at: null, ...over,
});

const candRow = (id: string, over: Record<string, unknown> = {}) => ({
  id, run_id: RUN, source: 'osm', source_ref: `node/${id.slice(-1)}`, name: `Lugar ${id.slice(-1)}`, category: 'bar',
  address: `Rua ${id.slice(-1)}`, lat: -23.6008, lng: -46.665, location_precision: 'point', phone: '', website: null,
  distance_m: 55, status: 'novo', reason: null, lead_id: null, lead: null, ...over,
});

function fakeProvider(over: Partial<PlacesProvider> & { resultado?: LugarNormalizado[] } = {}) {
  const buscar = jest.fn(async (_p: BuscaParams) => over.resultado ?? [lugar()]);
  const p: PlacesProvider = { id: 'osm', disponivel: () => true, buscar, ...over };
  return { p, buscar };
}

function setup(o: {
  area?: unknown;
  emAndamento?: unknown;
  recente?: unknown;
  osm?: PlacesProvider;
  apify?: PlacesProvider;
  leads?: unknown[];
  usadoApify?: number;
  run?: unknown;
  candidatos?: unknown[];
  claimCount?: number;
} = {}) {
  const osm = o.osm ?? fakeProvider().p;
  const apify = o.apify ?? { id: 'apify' as const, disponivel: () => false, buscar: jest.fn() };
  const findFirstRun = jest.fn(async (args: { where: Record<string, unknown> }) => {
    const st = args.where.status;
    if (st && typeof st === 'object') return o.emAndamento ?? null;
    if (st === 'done') return o.recente ?? null;
    return 'run' in o ? o.run : runRow({ status: 'done', finished_at: new Date() });
  });
  const place_import_runs = {
    findFirst: findFirstRun,
    findMany: jest.fn().mockResolvedValue([runRow()]),
    create: jest.fn().mockImplementation(({ data }) => Promise.resolve(runRow({ ...data }))),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    findUniqueOrThrow: jest.fn().mockImplementation(() => Promise.resolve(runRow({ status: 'running' }))),
    aggregate: jest.fn().mockResolvedValue({ _sum: { reserved_places: o.usadoApify ?? 0 } }),
  };
  const place_candidates = {
    findMany: jest.fn().mockResolvedValue(o.candidatos ?? []),
    createMany: jest.fn().mockResolvedValue({ count: 0 }),
    update: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: o.claimCount ?? 1 }),
  };
  const leads = { findMany: jest.fn().mockResolvedValue(o.leads ?? []) };
  const prisma = {
    pracas: { findUnique: jest.fn(async ({ where }: { where: { id: string } }) => ([PRACA_A, PRACA_B].includes(where.id) ? { id: where.id } : null)) },
    field_areas: { findFirst: jest.fn().mockResolvedValue('area' in o ? o.area : areaRow()) },
    place_import_runs,
    place_candidates,
    leads,
    $transaction: jest.fn(),
  };
  (prisma.$transaction as jest.Mock).mockImplementation((fn: (tx: unknown) => unknown) => fn(prisma));
  const imports = {
    criarLeadsDeBusca: jest.fn().mockImplementation(async (_tx, input: { itens: { source_ref: string }[] }) => ({
      batch_id: 'batch-1',
      leads: input.itens.map((i, n) => ({ source_ref: i.source_ref, lead_id: `lead-${n}` })),
    })),
  };
  const service = new PlacesSearchService(
    prisma as unknown as PrismaService,
    imports as unknown as ImportsService,
    { osm, apify },
    { apifyMaxPerRun: 300, apifyMonthlyCap: 3000 },
  );
  return { service, prisma, place_import_runs, place_candidates, leads, imports, osm, apify };
}

describe('start — validação e isolamento', () => {
  it('área de outra praça (ou inexistente) => 404', async () => {
    const { service, place_import_runs } = setup({ area: null });
    await expect(service.start({ praca_id: PRACA_B, area_id: AREA, types: ['bar'] }, ADMIN)).rejects.toMatchObject({ response: { code: 'NOT_FOUND' } });
    expect(place_import_runs.create).not.toHaveBeenCalled();
  });
  it('praça inexistente / id malformado => 404', async () => {
    const { service } = setup();
    await expect(service.start({ praca_id: 'xxx', area_id: AREA, types: ['bar'] }, ADMIN)).rejects.toMatchObject({ response: { code: 'NOT_FOUND' } });
    await expect(service.start({ praca_id: PRACA_A, area_id: 'xxx', types: ['bar'] }, ADMIN)).rejects.toMatchObject({ response: { code: 'NOT_FOUND' } });
  });
  it('área desativada => 409 AREA_INACTIVE', async () => {
    const { service } = setup({ area: areaRow({ active: false }) });
    await expect(service.start({ praca_id: PRACA_A, area_id: AREA, types: ['bar'] }, ADMIN)).rejects.toMatchObject({ response: { code: 'AREA_INACTIVE' } });
  });
  it('Apify desligado/sem token => 422 SOURCE_UNAVAILABLE, nada criado', async () => {
    const { service, place_import_runs } = setup();
    await expect(service.start({ praca_id: PRACA_A, area_id: AREA, types: ['bar'], source: 'apify' }, ADMIN)).rejects.toMatchObject({ response: { code: 'SOURCE_UNAVAILABLE' } });
    expect(place_import_runs.create).not.toHaveBeenCalled();
  });
});

describe('start — cache de 7 dias e fila', () => {
  const dto = { praca_id: PRACA_A, area_id: AREA, types: ['restaurante', 'bar'] };

  it('busca igual concluída há menos de 7 dias => devolve a mesma (cached) sem chamar o provedor', async () => {
    const { service, place_import_runs, osm } = setup({ recente: runRow({ status: 'done', finished_at: new Date(Date.now() - 2 * 86_400_000) }) });
    const r = await service.start(dto, ADMIN);
    expect(r.nova).toBe(false);
    expect(r.run.cached).toBe(true);
    expect(place_import_runs.create).not.toHaveBeenCalled();
    expect(osm.buscar).not.toHaveBeenCalled();
  });
  it('cache vencido (8 dias) => cria nova', async () => {
    const { service, place_import_runs } = setup({ recente: runRow({ status: 'done', finished_at: new Date(Date.now() - 8 * 86_400_000) }) });
    const r = await service.start(dto, ADMIN);
    expect(r.nova).toBe(true);
    expect(place_import_runs.create).toHaveBeenCalledTimes(1);
    await service.aguardarFila();
  });
  it('refresh ignora o cache', async () => {
    const { service, place_import_runs } = setup({ recente: runRow({ status: 'done', finished_at: new Date() }) });
    const r = await service.start({ ...dto, refresh: true }, ADMIN);
    expect(r.nova).toBe(true);
    expect(place_import_runs.create).toHaveBeenCalledTimes(1);
    await service.aguardarFila();
  });
  it('a mesma busca já na fila/rodando é devolvida (duplo clique não dispara duas)', async () => {
    const { service, place_import_runs } = setup({ emAndamento: runRow({ status: 'running' }) });
    const r = await service.start(dto, ADMIN);
    expect(r.nova).toBe(false);
    expect(r.run.status).toBe('running');
    expect(place_import_runs.create).not.toHaveBeenCalled();
  });
  it('a chave do cache usa a geometria da área e os tipos ordenados', async () => {
    const { service, place_import_runs } = setup();
    await service.start(dto, ADMIN);
    const data = place_import_runs.create.mock.calls[0]![0].data;
    expect(data).toMatchObject({ praca_id: PRACA_A, area_name: 'Moema', lat: -23.6003, lng: -46.665, radius_m: 1500, types: ['bar', 'restaurante'], source: 'osm', requested_by: ADMIN.id });
    expect(data.cache_key).toMatch(/^[0-9a-f]{40}$/);
    await service.aguardarFila();
  });
  it('raio escolhido na busca vale para a busca e para a chave do cache; ausente = o da área', async () => {
    const a = setup();
    await a.service.start(dto, ADMIN);
    await a.service.aguardarFila();
    const b = setup();
    await b.service.start({ ...dto, radius_m: 8000 }, ADMIN);
    await b.service.aguardarFila();
    const daArea = a.place_import_runs.create.mock.calls[0]![0].data;
    const escolhido = b.place_import_runs.create.mock.calls[0]![0].data;
    expect(daArea.radius_m).toBe(1500);
    expect(escolhido).toMatchObject({ radius_m: 8000, lat: -23.6003, lng: -46.665, area_name: 'Moema' });
    expect(escolhido.cache_key).not.toBe(daArea.cache_key);
  });
  it('raio acima de 15 km na busca de estabelecimentos = 400, nada criado', async () => {
    const { service, place_import_runs } = setup();
    await expect(service.start({ ...dto, radius_m: 20000 }, ADMIN)).rejects.toMatchObject({
      response: { code: 'VALIDATION_ERROR', message: 'radius_m: na busca de estabelecimentos, de 1 a 15 km.' },
    });
    expect(place_import_runs.create).not.toHaveBeenCalled();
  });
});

describe('execução em segundo plano (provedor fake)', () => {
  const dto = { praca_id: PRACA_A, area_id: AREA, types: ['bar'] };

  it('busca, classifica (fechado/sem nome/repetido/já é lead) e grava candidatos + contadores', async () => {
    const fake = fakeProvider({
      resultado: [
        lugar({ source_ref: 'node/1', name: 'Bar do Chico', lat: -23.6004 }),
        lugar({ source_ref: 'node/2', name: 'Boteco Fechado', lat: -23.601, closed: true }),
        lugar({ source_ref: 'node/3', name: '', lat: -23.602 }),
        lugar({ source_ref: 'node/4', name: 'Café Ipê', lat: -23.603, phone: '(11) 2222-3333' }),
      ],
    });
    const { service, place_import_runs, place_candidates } = setup({
      osm: fake.p,
      leads: [{ id: 'L9', name: 'Cafe Ipe Moema', address: '', phone: '11 2222 3333', lat: null, lng: null, source: null, source_ref: null }],
    });
    await service.start(dto, ADMIN);
    await service.aguardarFila();

    expect(fake.buscar).toHaveBeenCalledTimes(1);
    expect(fake.buscar.mock.calls[0]![0]).toMatchObject({ raio_m: 1500, types: ['bar'], limite: 301 });
    const fim = place_import_runs.updateMany.mock.calls.find((c) => c[0].data.status === 'done')![0];
    expect(fim.where).toEqual({ id: RUN, status: 'running' });
    expect(fim.data).toMatchObject({ found: 4, novos: 1, duplicados: 1, descartados: 2, truncated: false, est_cost_usd: 0 });
    const gravados = place_candidates.createMany.mock.calls[0]![0].data as { source_ref: string; status: string; reason: string | null; lead_id: string | null }[];
    expect(gravados.map((g) => [g.source_ref, g.status, g.reason, g.lead_id])).toEqual([
      ['node/1', 'novo', null, null],
      ['node/2', 'descartado', 'parece_fechado', null],
      ['node/3', 'descartado', 'sem_nome', null],
      ['node/4', 'duplicado', 'ja_na_praca', 'L9'],
    ]);
  });

  it('Overpass parou no próprio teto (resposta parcial) => truncated mesmo com poucos achados', async () => {
    const osm: PlacesProvider = {
      id: 'osm', disponivel: () => true,
      buscar: jest.fn(async (p: BuscaParams) => {
        p.onParcial?.();
        return [lugar()];
      }),
    };
    const { service, place_import_runs } = setup({ osm });
    await service.start(dto, ADMIN);
    await service.aguardarFila();
    const fim = place_import_runs.updateMany.mock.calls.find((c) => c[0].data.status === 'done')![0];
    expect(fim.data.truncated).toBe(true);
  });

  it('falha do provedor => run "error" com a mensagem para pessoa, sem candidatos', async () => {
    const osm: PlacesProvider = {
      id: 'osm', disponivel: () => true,
      buscar: jest.fn().mockRejectedValue(new ProviderError('A busca não funcionou agora. Nada foi cobrado.', 'HTTP 504')),
    };
    const { service, place_import_runs, place_candidates } = setup({ osm });
    await service.start(dto, ADMIN);
    await service.aguardarFila();
    const erro = place_import_runs.updateMany.mock.calls.find((c) => c[0].data.status === 'error')![0];
    expect(erro.data.error).toBe('A busca não funcionou agora. Nada foi cobrado.');
    expect(place_candidates.createMany).not.toHaveBeenCalled();
  });

  it('exceção inesperada => mensagem genérica (nada de texto técnico para a pessoa)', async () => {
    const osm: PlacesProvider = { id: 'osm', disponivel: () => true, buscar: jest.fn().mockRejectedValue(new Error('boom interno https://x?token=segredo')) };
    const { service, place_import_runs } = setup({ osm });
    await service.start(dto, ADMIN);
    await service.aguardarFila();
    const erro = place_import_runs.updateMany.mock.calls.find((c) => c[0].data.status === 'error')![0];
    expect(erro.data.error).toBe('Não conseguimos fazer isso agora. Tente de novo.');
    expect(JSON.stringify(erro.data)).not.toContain('segredo');
  });

  it('cancelada no meio: BuscaCancelada não grava erro; cancelada durante a busca não grava candidatos', async () => {
    const osm: PlacesProvider = { id: 'osm', disponivel: () => true, buscar: jest.fn().mockRejectedValue(new BuscaCancelada()) };
    const a = setup({ osm });
    await a.service.start(dto, ADMIN);
    await a.service.aguardarFila();
    expect(a.place_import_runs.updateMany.mock.calls.some((c) => c[0].data.status === 'error')).toBe(false);

    const b = setup();
    // o "done" só vale se ainda estiver running: cancelamento vence (count 0)
    b.place_import_runs.updateMany.mockImplementation(async ({ data }: { data: { status?: string } }) => ({ count: data.status === 'done' ? 0 : 1 }));
    await b.service.start(dto, ADMIN);
    await b.service.aguardarFila();
    expect(b.place_candidates.createMany).not.toHaveBeenCalled();
  });

  it('cancelada antes de começar (claim queued->running dá 0) => provedor nem é chamado', async () => {
    const fake = fakeProvider();
    const { service, place_import_runs } = setup({ osm: fake.p });
    place_import_runs.updateMany.mockResolvedValueOnce({ count: 0 });
    await service.start(dto, ADMIN);
    await service.aguardarFila();
    expect(fake.buscar).not.toHaveBeenCalled();
  });

  it('duas buscas seguidas rodam uma por vez (nunca duas requisições juntas)', async () => {
    let emVoo = 0;
    let max = 0;
    const osm: PlacesProvider = {
      id: 'osm', disponivel: () => true,
      buscar: jest.fn(async () => {
        emVoo++;
        max = Math.max(max, emVoo);
        await new Promise((r) => setTimeout(r, 5));
        emVoo--;
        return [];
      }),
    };
    const { service } = setup({ osm });
    await service.start({ ...dto, types: ['bar'] }, ADMIN);
    await service.start({ ...dto, types: ['cafe'] }, ADMIN);
    await service.aguardarFila();
    expect(osm.buscar).toHaveBeenCalledTimes(2);
    expect(max).toBe(1);
  });

  it('no boot, queued/running viram erro "interrompida"', async () => {
    const { service, place_import_runs } = setup();
    await service.onApplicationBootstrap();
    expect(place_import_runs.updateMany).toHaveBeenCalledWith({
      where: { status: { in: ['queued', 'running'] } },
      data: expect.objectContaining({ status: 'error', error: 'Interrompida: o servidor foi reiniciado.' }),
    });
  });
});

describe('Apify — teto mensal', () => {
  const dto = { praca_id: PRACA_A, area_id: AREA, types: ['bar'], source: 'apify' };
  const apifyOk = () => fakeProvider({ id: 'apify', resultado: [lugar({ source: 'apify', source_ref: 'p1' })] });

  it('limite = o que sobra no mês quando é menor que o teto por busca; custo estimado gravado', async () => {
    const f = apifyOk();
    const { service, place_import_runs } = setup({ apify: f.p, usadoApify: 2900 });
    place_import_runs.findUniqueOrThrow.mockResolvedValue(runRow({ status: 'running', source: 'apify' }));
    await service.start(dto, ADMIN);
    await service.aguardarFila();
    expect(f.buscar.mock.calls[0]![0].limite).toBe(100);
    // reserva antes de chamar o actor: cancelar/estourar o tempo não "devolve" o teto
    expect(place_import_runs.updateMany).toHaveBeenCalledWith({
      where: { id: RUN, status: 'running' },
      data: { reserved_places: 100 },
    });
    const soma = place_import_runs.aggregate.mock.calls[0]![0];
    expect(soma._sum).toEqual({ reserved_places: true });
    const fim = place_import_runs.updateMany.mock.calls.find((c) => c[0].data.status === 'done')![0];
    expect(fim.data.est_cost_usd).toBe(0.007);
  });
  it('teto atingido => erro claro e o provedor não é chamado', async () => {
    const f = apifyOk();
    const { service, place_import_runs } = setup({ apify: f.p, usadoApify: 3000 });
    place_import_runs.findUniqueOrThrow.mockResolvedValue(runRow({ status: 'running', source: 'apify' }));
    await service.start(dto, ADMIN);
    await service.aguardarFila();
    expect(f.buscar).not.toHaveBeenCalled();
    const erro = place_import_runs.updateMany.mock.calls.find((c) => c[0].data.status === 'error')![0];
    expect(erro.data.error).toBe('O limite mensal de pesquisas pagas foi atingido. Nada foi cobrado.');
  });
  it('sources(): sem token a fonte paga aparece indisponível', async () => {
    const { service } = setup({ usadoApify: 100 });
    const s = await service.sources();
    expect(s[0]).toMatchObject({ id: 'osm', available: true, paid: false });
    expect(s[1]).toMatchObject({ id: 'apify', available: false, paid: true, used_this_month: 100, monthly_cap: 3000 });
  });
});

describe('leitura — isolamento entre praças', () => {
  it('busca de outra praça => 404 em get, candidates, cancel e leads', async () => {
    const { service } = setup({ run: null });
    await expect(service.get(RUN, PRACA_B)).rejects.toMatchObject({ response: { code: 'NOT_FOUND' } });
    await expect(service.candidates(RUN, PRACA_B)).rejects.toMatchObject({ response: { code: 'NOT_FOUND' } });
    await expect(service.cancel(RUN, PRACA_B)).rejects.toMatchObject({ response: { code: 'NOT_FOUND' } });
    await expect(service.addLeads(RUN, { praca_id: PRACA_B, candidate_ids: [C1] }, ADMIN)).rejects.toMatchObject({ response: { code: 'NOT_FOUND' } });
  });
  it('a consulta sempre filtra por id E praca_id', async () => {
    const { service, place_import_runs } = setup();
    await service.get(RUN, PRACA_A);
    expect(place_import_runs.findFirst).toHaveBeenCalledWith({ where: { id: RUN, praca_id: PRACA_A } });
  });
  it('cancelar o que já terminou => 409', async () => {
    const { service, place_import_runs } = setup();
    place_import_runs.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.cancel(RUN, PRACA_A)).rejects.toMatchObject({ response: { code: 'RUN_NOT_CANCELLABLE' } });
  });
  it('candidates recalcula: "novo" que virou lead depois da busca aparece como já na praça e não selecionável', async () => {
    const { service } = setup({
      candidatos: [candRow(C1, { name: 'Bar do Chico' }), candRow(C2, { source_ref: 'node/2', name: 'Padaria Zeta', lat: -23.61, address: 'Rua Z' })],
      leads: [{ id: 'L1', name: 'Bar do Chico Moema', address: '', phone: '', lat: -23.6008, lng: -46.665, source: null, source_ref: null }],
    });
    const v = await service.candidates(RUN, PRACA_A);
    expect(v[0]).toMatchObject({ status: 'duplicado', reason: 'ja_na_praca', lead_id: 'L1', lead_name: 'Bar do Chico Moema', selectable: false });
    expect(v[1]).toMatchObject({ status: 'novo', selectable: true });
  });
});

describe('lead arquivado com o mesmo source_ref (UNIQUE vale até arquivado)', () => {
  const arquivado = { id: 'LA', name: 'Qualquer', address: '', phone: '', lat: null, lng: null, source: 'osm', source_ref: 'node/1' };
  const done = runRow({ status: 'done', finished_at: new Date() });

  it('a consulta de duplicidade não filtra arquivado no ramo do source_ref (mas filtra nos demais)', async () => {
    const { service, leads } = setup({ candidatos: [candRow(C1)] });
    await service.candidates(RUN, PRACA_A);
    const or = leads.findMany.mock.calls[0]![0].where.OR as Record<string, unknown>[];
    const porRef = or.find((b) => 'source_ref' in b)!;
    expect(porRef).toEqual({ source_ref: { in: ['node/1'] } });
    expect(or.filter((b) => !('source_ref' in b)).every((b) => b.archived === false)).toBe(true);
  });
  it('na leitura: candidato cujo ponto já é lead (arquivado) aparece como já na praça', async () => {
    const { service } = setup({ candidatos: [candRow(C1)], leads: [arquivado] });
    const [v] = await service.candidates(RUN, PRACA_A);
    expect(v).toMatchObject({ status: 'duplicado', reason: 'ja_na_praca', lead_id: 'LA', selectable: false });
  });
  it('ao adicionar: é pulado (nada de estourar o UNIQUE e travar o lote inteiro)', async () => {
    const { service, imports } = setup({ run: done, candidatos: [candRow(C1), candRow(C2)], leads: [arquivado], claimCount: 1 });
    const r = await service.addLeads(RUN, { praca_id: PRACA_A, candidate_ids: [C1, C2] }, ADMIN);
    expect(r.created).toBe(1);
    expect(r.skipped).toEqual([{ candidate_id: C1, reason: 'ja_na_praca' }]);
    expect(imports.criarLeadsDeBusca.mock.calls[0]![1].itens).toHaveLength(1);
  });
});

describe('addLeads — "Adicionar N como leads"', () => {
  const dto = { praca_id: PRACA_A, candidate_ids: [C1, C2] };
  const done = runRow({ status: 'done', finished_at: new Date() });

  it('cria os leads pelo caminho do imports (origem "pesquisa automática"), liga candidato->lead e devolve o lote', async () => {
    const { service, imports, place_candidates } = setup({ run: done, candidatos: [candRow(C1), candRow(C2)], claimCount: 2 });
    const r = await service.addLeads(RUN, dto, ADMIN);
    expect(r).toEqual({ batch_id: 'batch-1', created: 2, skipped: [] });
    const [, input, user] = imports.criarLeadsDeBusca.mock.calls[0]!;
    expect(user).toBe(ADMIN);
    expect(input).toMatchObject({ praca_id: PRACA_A, origem: 'pesquisa automática' });
    expect(input.file_name).toMatch(/^Busca \d{2}\/\d{2} · Moema \(OSM\)$/);
    expect(input.itens[0]).toMatchObject({ lat: -23.6008, lng: -46.665, location_precision: 'point', source: 'osm', source_ref: 'node/1' });
    expect(place_candidates.updateMany).toHaveBeenCalledWith({
      where: { run_id: RUN, id: { in: [C1, C2] }, status: 'novo' },
      data: { status: 'adicionado' },
    });
    expect(place_candidates.update).toHaveBeenCalledWith({ where: { id: C1 }, data: { lead_id: 'lead-0' } });
  });
  it('pula o que já não é novo e o que virou duplicado desde a busca; id estranho vai para skipped', async () => {
    const { service, imports } = setup({
      run: done,
      candidatos: [candRow(C1, { status: 'adicionado' }), candRow(C2, { name: 'Bar do Chico', address: 'Av. Ibirapuera, 88' })],
      leads: [{ id: 'L1', name: 'BAR DO CHICO', address: 'av ibirapuera 88', phone: '', lat: null, lng: null, source: null, source_ref: null }],
    });
    await expect(service.addLeads(RUN, { praca_id: PRACA_A, candidate_ids: [C1, C2, C3] }, ADMIN)).rejects.toMatchObject({ response: { code: 'NOTHING_TO_ADD' } });
    expect(imports.criarLeadsDeBusca).not.toHaveBeenCalled();
  });
  it('parcial: cria os elegíveis e lista o motivo dos pulados', async () => {
    const { service } = setup({ run: done, candidatos: [candRow(C1), candRow(C2, { status: 'descartado', reason: 'parece_fechado' })] });
    const r = await service.addLeads(RUN, dto, ADMIN);
    expect(r.created).toBe(1);
    expect(r.skipped).toEqual([{ candidate_id: C2, reason: 'parece_fechado' }]);
  });
  it('duas pessoas ao mesmo tempo: reserva não bate => 409 CANDIDATES_CHANGED e nenhum lead criado', async () => {
    const { service, imports } = setup({ run: done, candidatos: [candRow(C1), candRow(C2)], claimCount: 1 });
    await expect(service.addLeads(RUN, dto, ADMIN)).rejects.toMatchObject({ response: { code: 'CANDIDATES_CHANGED' } });
    expect(imports.criarLeadsDeBusca).not.toHaveBeenCalled();
  });
  it('índice único (source, source_ref) estourado => 409 amigável', async () => {
    const { service, imports } = setup({ run: done, candidatos: [candRow(C1)] });
    imports.criarLeadsDeBusca.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('x', { code: 'P2002', clientVersion: 't' }));
    await expect(service.addLeads(RUN, { praca_id: PRACA_A, candidate_ids: [C1] }, ADMIN)).rejects.toMatchObject({ response: { code: 'CANDIDATES_CHANGED' } });
  });
  it('busca que ainda não terminou => 409 RUN_NOT_READY; id malformado => 400', async () => {
    const a = setup({ run: runRow({ status: 'running' }) });
    await expect(a.service.addLeads(RUN, dto, ADMIN)).rejects.toMatchObject({ response: { code: 'RUN_NOT_READY' } });
    const b = setup({ run: done });
    await expect(b.service.addLeads(RUN, { praca_id: PRACA_A, candidate_ids: ['nao-uuid'] }, ADMIN)).rejects.toMatchObject({ response: { code: 'VALIDATION_ERROR' } });
  });
});

describe('PlacesController', () => {
  it('é só de admin (metadado no controller inteiro)', () => {
    expect(Reflect.getMetadata(ADMIN_ONLY_KEY, PlacesController)).toBe(true);
  });
  it('não é rota do consultor de campo (sem @CampoRoute)', () => {
    const chaves = Reflect.getMetadataKeys(PlacesController).concat(Reflect.getMetadataKeys(PlacesController.prototype.start));
    expect(chaves.map(String).join(',')).not.toMatch(/campo/i);
  });
});

describe('Lote E §42.3 — o gestor só no mapa aberto (o Apify é pago: só admin)', () => {
  const GESTOR: AuthUser = { id: '00000000-0000-4000-8000-0000000000ef', email: 'g@a.com', name: 'G', is_admin: false, is_gestor: true };
  const EQUIPE: AuthUser = { id: '00000000-0000-4000-8000-0000000000f0', email: 'e@a.com', name: 'E', is_admin: false };
  it('gestor com source=apify = 403 antes de qualquer leitura; com osm (ou sem source) segue', async () => {
    const { service, place_import_runs } = setup();
    await expect(service.start({ praca_id: PRACA_A, area_id: AREA, types: ['bar'], source: 'apify' }, GESTOR)).rejects.toMatchObject({ status: 403, response: { code: 'FORBIDDEN' } });
    expect(place_import_runs.create).not.toHaveBeenCalled();
    await expect(service.start({ praca_id: PRACA_A, area_id: AREA, types: ['bar'] }, GESTOR)).resolves.toBeDefined();
  });
  it('a lista do gestor pede só as do mapa aberto; a do admin, todas (como hoje)', async () => {
    const { service, place_import_runs } = setup();
    await service.list(PRACA_A, GESTOR);
    expect(place_import_runs.findMany.mock.calls[0][0].where).toMatchObject({ praca_id: PRACA_A, source: 'osm' });
    await service.list(PRACA_A, ADMIN);
    expect(place_import_runs.findMany.mock.calls[1][0].where).not.toHaveProperty('source');
    await service.list(PRACA_A, EQUIPE);
    expect(place_import_runs.findMany.mock.calls[2][0].where).not.toHaveProperty('source');
  });
  it('abrir, ver candidatos, cancelar ou adicionar de uma busca Apify = 403 para o gestor; do mapa aberto passa', async () => {
    const apify = runRow({ source: 'apify', status: 'done', finished_at: new Date() });
    const { service } = setup({ run: apify });
    await expect(service.get(RUN, PRACA_A, GESTOR)).rejects.toMatchObject({ status: 403 });
    await expect(service.candidates(RUN, PRACA_A, GESTOR)).rejects.toMatchObject({ status: 403 });
    await expect(service.cancel(RUN, PRACA_A, GESTOR)).rejects.toMatchObject({ status: 403 });
    await expect(service.addLeads(RUN, { praca_id: PRACA_A, candidate_ids: [] }, GESTOR)).rejects.toMatchObject({ status: 403 });
    await expect(service.get(RUN, PRACA_A, ADMIN)).resolves.toMatchObject({ source: 'apify' });
    const { service: s2 } = setup({ run: runRow({ status: 'done', finished_at: new Date() }) });
    await expect(s2.get(RUN, PRACA_A, GESTOR)).resolves.toMatchObject({ source: 'osm' });
  });
});
