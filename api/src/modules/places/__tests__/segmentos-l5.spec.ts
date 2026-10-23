import 'reflect-metadata';
import { BadRequestException, Logger, ValidationPipe } from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
} from 'class-validator';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { AuthUser } from '../../../common/auth/auth-user';
import type { PrismaService } from '../../../common/database/prisma.service';
import { flattenErrors } from '../../../common/validation/flatten-errors';
import { chaveCache, FONTES_LUGAR, montarQueryOverpass, TIPOS_LUGAR } from '../../../domain/places-rules';
import {
  montarQuerySegmentos,
  SEGMENTOS_PADRAO,
  seletorRaio,
  type Segmento,
} from '../../../domain/segmentos-rules';
import type { ImportsService } from '../../imports/imports.service';
import type { FlagsLovableC } from '../../rotas/rotas.tokens';
import { StartPlaceSearchDto } from '../dto/places.dto';
import { PlacesSearchService } from '../places-search.service';
import { PlacesSegmentsService } from '../places-segments.service';
import type { BuscaParams, PlacesProvider } from '../providers/places-provider';
import { OverpassProvider } from '../providers/overpass.provider';

beforeAll(() => Logger.overrideLogger(false));

/** O DTO de HOJE, copiado de propósito: é o oráculo da mensagem com a flag desligada. */
class StartPlaceSearchDtoDeHoje {
  @IsString()
  praca_id!: string;
  @IsString()
  area_id!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(TIPOS_LUGAR.length)
  @ArrayUnique()
  @IsIn(TIPOS_LUGAR, { each: true })
  types!: string[];
  @IsOptional()
  @IsIn(FONTES_LUGAR)
  source?: string;
  @IsOptional()
  @IsBoolean()
  refresh?: boolean;
}

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  exceptionFactory: (errors) =>
    new BadRequestException({ code: 'VALIDATION_ERROR', message: flattenErrors(errors) }),
});
async function mensagem(metatype: new () => object, body: unknown): Promise<string | null> {
  try {
    await pipe.transform(body, { type: 'body', metatype });
    return null;
  } catch (e) {
    return ((e as BadRequestException).getResponse() as { message: string }).message;
  }
}

const PRACA = '00000000-0000-4000-8000-0000000000aa';
const AREA = '00000000-0000-4000-8000-0000000000cc';
const ADMIN: AuthUser = {
  id: '00000000-0000-4000-8000-0000000000ee',
  email: 'a@a.com',
  name: 'A',
  is_admin: true,
};

describe('L5 — validação dos tipos com a flag DESLIGADA (mensagem igual à de hoje)', () => {
  const antes = process.env.FIELD_SEGMENTS_ENABLED;
  afterEach(() => {
    process.env.FIELD_SEGMENTS_ENABLED = antes;
  });

  it.each([
    ['slug novo', { types: ['hotel'] }],
    ['6 tipos', { types: ['bar', 'restaurante', 'lanchonete', 'padaria', 'cafe', 'bar'] }],
    ['vazio', { types: [] }],
    ['não é lista', { types: 'bar' }],
    ['ausente', {}],
    ['repetido + desconhecido + outro campo inválido', { types: ['bar', 'bar', 'x'], refresh: 'sim' }],
  ])('%s', async (_n, extra) => {
    delete process.env.FIELD_SEGMENTS_ENABLED;
    const body = { praca_id: PRACA, area_id: AREA, ...extra };
    const hoje = await mensagem(StartPlaceSearchDtoDeHoje, body);
    expect(hoje).not.toBeNull();
    expect(await mensagem(StartPlaceSearchDto, body)).toBe(hoje);
    process.env.FIELD_SEGMENTS_ENABLED = 'false';
    expect(await mensagem(StartPlaceSearchDto, body)).toBe(hoje);
  });

  it('o corpo válido de hoje continua válido', async () => {
    delete process.env.FIELD_SEGMENTS_ENABLED;
    expect(
      await mensagem(StartPlaceSearchDto, { praca_id: PRACA, area_id: AREA, types: ['bar', 'restaurante'] }),
    ).toBeNull();
  });

  it('com a flag LIGADA o DTO deixa os tipos para o serviço (segmentos ativos)', async () => {
    process.env.FIELD_SEGMENTS_ENABLED = 'true';
    expect(
      await mensagem(StartPlaceSearchDto, { praca_id: PRACA, area_id: AREA, types: ['hotel', 'pizzaria'] }),
    ).toBeNull();
    expect(
      await mensagem(StartPlaceSearchDto, { praca_id: PRACA, area_id: AREA, types: ['bar'], extra: 1 }),
    ).toMatch(/extra/);
  });
});

describe('L5 — chave do cache', () => {
  it('sem o hash da foto, a fórmula é a de hoje (cache vivo não invalida no deploy)', () => {
    const p = { source: 'osm', lat: -23.6, lng: -46.66, radius_m: 1500, types: ['restaurante', 'bar'] };
    const hoje = createHash('sha256')
      .update(JSON.stringify(['osm', -23.6, -46.66, 1500, ['bar', 'restaurante']]))
      .digest('hex')
      .slice(0, 40);
    expect(chaveCache(p)).toBe(hoje);
    expect(chaveCache({ ...p, segmentos_hash: 'abc' })).not.toBe(hoje);
  });
});

// ── serviço ──────────────────────────────────────────────────

function montar(o: { segLigado: boolean; gravado?: unknown; snapshot?: unknown }) {
  const flags: FlagsLovableC = { segments: o.segLigado, vouchers: false, voucher_coupons: false };
  const buscar = jest.fn(async (_p: BuscaParams) => []);
  const osm: PlacesProvider = { id: 'osm', disponivel: () => true, buscar };
  const apify: PlacesProvider = { id: 'apify', disponivel: () => false, buscar: jest.fn() };
  let place_segments: unknown = o.gravado ?? null;
  const criado: Record<string, unknown>[] = [];
  const prisma: Record<string, unknown> = {
    app_settings: {
      findUnique: jest.fn(async () => ({ place_segments })),
      upsert: jest.fn(async ({ update }: { update: { place_segments: unknown } }) => {
        place_segments = update.place_segments;
        return {};
      }),
    },
    pracas: { findUnique: jest.fn(async () => ({ id: PRACA })) },
    field_areas: {
      findFirst: jest.fn(async () => ({
        id: AREA,
        praca_id: PRACA,
        name: 'Moema',
        lat: -23.6,
        lng: -46.66,
        radius_m: 1500,
        active: true,
      })),
    },
    place_import_runs: {
      findFirst: jest.fn(async () => null),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        criado.push(data);
        return {
          id: 'r1',
          status: 'queued',
          found: 0,
          novos: 0,
          duplicados: 0,
          descartados: 0,
          truncated: false,
          est_cost_usd: 0,
          error: null,
          created_at: new Date(),
          started_at: null,
          finished_at: null,
          ...data,
        };
      }),
      updateMany: jest.fn(async () => ({ count: 1 })),
      findUniqueOrThrow: jest.fn(async () => ({
        id: 'r1',
        ...criado[criado.length - 1],
        status: 'running',
        segments_snapshot: o.snapshot ?? criado[criado.length - 1]?.segments_snapshot ?? null,
      })),
    },
    place_candidates: { createMany: jest.fn(async () => ({ count: 0 })) },
    leads: { findMany: jest.fn(async () => []) },
    $transaction: jest.fn(async (fn: (tx: unknown) => unknown): Promise<unknown> => fn(prisma)),
  };
  const segmentos = new PlacesSegmentsService(prisma as unknown as PrismaService, flags);
  const service = new PlacesSearchService(
    prisma as unknown as PrismaService,
    {} as ImportsService,
    { osm, apify },
    { apifyMaxPerRun: 300, apifyMonthlyCap: 3000 },
    segmentos,
  );
  return { service, segmentos, prisma, buscar, criado };
}

describe('L5 — busca com a flag DESLIGADA = hoje', () => {
  it('sem foto, sem hash, o provedor recebe só os tipos', async () => {
    const { service, buscar, criado } = montar({ segLigado: false });
    await service.start({ praca_id: PRACA, area_id: AREA, types: ['restaurante', 'bar'] }, ADMIN);
    await service.aguardarFila();
    expect(criado[0].segments_snapshot).toBeUndefined();
    expect(criado[0].cache_key).toBe(
      chaveCache({ lat: -23.6, lng: -46.66, radius_m: 1500, types: ['bar', 'restaurante'], source: 'osm' }),
    );
    expect(buscar.mock.calls[0][0].segmentos).toBeUndefined();
    expect(buscar.mock.calls[0][0].types).toEqual(['bar', 'restaurante']);
  });

  it('as rotas de segmentos respondem 404 SEGMENTS_DISABLED', async () => {
    const { segmentos } = montar({ segLigado: false });
    await expect(segmentos.view()).rejects.toMatchObject({
      status: 404,
      response: { code: 'SEGMENTS_DISABLED' },
    });
    await expect(segmentos.salvar([], ADMIN)).rejects.toMatchObject({
      status: 404,
      response: { code: 'SEGMENTS_DISABLED' },
    });
  });
});

describe('L5 — busca com a flag LIGADA', () => {
  it('tipos novos: foto gravada, hash na chave do cache, o provedor recebe os segmentos', async () => {
    const { service, buscar, criado } = montar({ segLigado: true });
    await service.start({ praca_id: PRACA, area_id: AREA, types: ['pizzaria', 'hotel'] }, ADMIN);
    await service.aguardarFila();
    expect(criado[0].types).toEqual(['hotel', 'pizzaria']);
    expect((criado[0].segments_snapshot as Segmento[]).map((s) => s.slug)).toEqual(['hotel', 'pizzaria']);
    expect(criado[0].cache_key).not.toBe(
      chaveCache({ lat: -23.6, lng: -46.66, radius_m: 1500, types: ['hotel', 'pizzaria'], source: 'osm' }),
    );
    expect(buscar.mock.calls[0][0].segmentos?.map((s) => s.slug)).toEqual(['hotel', 'pizzaria']);
  });

  it('os 5 de hoje com os segmentos padrão: a consulta que sai para o Overpass é a de hoje, byte a byte', async () => {
    const { service, buscar } = montar({ segLigado: true });
    await service.start(
      { praca_id: PRACA, area_id: AREA, types: ['restaurante', 'lanchonete', 'padaria'] },
      ADMIN,
    );
    await service.aguardarFila();
    const p = buscar.mock.calls[0][0];
    expect(montarQuerySegmentos(p.segmentos!, seletorRaio(p.centro, p.raio_m))).toBe(
      montarQueryOverpass(p.centro, p.raio_m, ['lanchonete', 'padaria', 'restaurante']),
    );
  });

  it.each([
    ['slug desconhecido', ['nao_existe'], "types: 'nao_existe' não é um segmento ativo da busca."],
    ['11 tipos', Array.from({ length: 11 }, (_, i) => `s${i}`), 'types: escolha de 1 a 10 segmentos.'],
    ['repetido', ['bar', 'bar'], 'types: cada segmento só uma vez.'],
    ['não é lista', 'bar', 'types: escolha de 1 a 10 segmentos.'],
  ])('recusa %s com 400 e nada criado', async (_n, types, msg) => {
    const { service, criado } = montar({ segLigado: true });
    await expect(
      service.start({ praca_id: PRACA, area_id: AREA, types: types as string[] }, ADMIN),
    ).rejects.toMatchObject({
      status: 400,
      response: { code: 'VALIDATION_ERROR', message: msg },
    });
    expect(criado).toHaveLength(0);
  });

  it('segmento desativado não entra na busca', async () => {
    const gravado = {
      segments: SEGMENTOS_PADRAO.map((s) => (s.slug === 'motel' ? { ...s, active: false } : s)),
    };
    const { service } = montar({ segLigado: true, gravado });
    await expect(
      service.start({ praca_id: PRACA, area_id: AREA, types: ['motel'] }, ADMIN),
    ).rejects.toMatchObject({
      response: { message: "types: 'motel' não é um segmento ativo da busca." },
    });
  });

  it('PUT: grava a lista, não deixa apagar slug existente e o GET devolve o que foi salvo', async () => {
    const { segmentos } = montar({ segLigado: true });
    expect((await segmentos.view()).is_default).toBe(true);
    await expect(
      segmentos.salvar(SEGMENTOS_PADRAO.filter((s) => s.slug !== 'hotel') as unknown[], ADMIN),
    ).rejects.toMatchObject({
      status: 400,
      response: {
        code: 'VALIDATION_ERROR',
        message: "segments: o segmento 'hotel' não pode ser apagado; desative-o.",
      },
    });
    const novo = {
      slug: 'sorveteria',
      label: 'Sorveteria',
      filters: [[{ key: 'amenity', op: '=', value: 'ice_cream' }]],
      keywords: [],
      priority: 15,
      active: true,
    };
    const v = await segmentos.salvar([...SEGMENTOS_PADRAO, novo] as unknown[], ADMIN);
    expect(v.is_default).toBe(false);
    expect(v.updated_by).toBe(ADMIN.id);
    expect(v.segments.map((s) => s.slug)).toContain('sorveteria');
    await expect(segmentos.salvar(SEGMENTOS_PADRAO as unknown as unknown[], ADMIN)).rejects.toMatchObject({
      response: { message: "segments: o segmento 'sorveteria' não pode ser apagado; desative-o." },
    });
  });
});

describe('L5 — provedor Overpass com a foto', () => {
  it('manda a consulta dos segmentos e classifica pelo slug (pizzaria antes de restaurante)', async () => {
    const corpos: string[] = [];
    const fetch = jest.fn(async (_u: string, init: RequestInit) => {
      corpos.push(decodeURIComponent(String(init.body).replace(/^data=/, '')));
      return new Response(
        JSON.stringify({
          elements: [
            {
              type: 'node',
              id: 7,
              lat: -23.6,
              lon: -46.66,
              tags: { amenity: 'restaurant', cuisine: 'pizza;italian', name: 'Forno' },
            },
          ],
        }),
        { status: 200 },
      );
    });
    const p = new OverpassProvider({
      url: 'http://x',
      userAgent: 'teste/1.0 (t)',
      fetch,
      sleep: async () => undefined,
    });
    const segs = SEGMENTOS_PADRAO.filter((s) => ['pizzaria', 'restaurante'].includes(s.slug));
    const r = await p.buscar({
      centro: { lat: -23.6, lng: -46.66 },
      raio_m: 900,
      types: [],
      segmentos: segs,
      limite: 301,
      signal: new AbortController().signal,
    });
    expect(corpos[0]).toContain('["cuisine"~"(^|;) *(pizza) *(;|$)"]');
    expect(r[0].category).toBe('pizzaria');
  });
});

describe('L5 — ordem das rotas', () => {
  it("'segments' vem antes de ':id' no controller", () => {
    const t = readFileSync(join(__dirname, '..', 'places.controller.ts'), 'utf8');
    expect(t.indexOf("@Get('segments')")).toBeLessThan(t.indexOf("@Get(':id')"));
    expect(t.indexOf("@Put('segments')")).toBeLessThan(t.indexOf("@Get(':id')"));
  });
});
