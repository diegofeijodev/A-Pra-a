import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../../../common/database/prisma.service';
import { ADMIN_ONLY_KEY } from '../../../common/decorators/admin-only.decorator';
import { CAMPO_ROUTE_KEY } from '../../../common/decorators/campo-route.decorator';
import { MAX_CELULAS } from '../../../domain/heat-grid';
import { ConsultoresController } from '../consultores.controller';
import { HeatmapQueryDto } from '../dto/heatmap.dto';
import { HeatmapService } from '../heatmap.service';

const PRACA = '00000000-0000-4000-8000-0000000000a1';
const CONS = '00000000-0000-4000-8000-0000000000c1';
const AREA = '00000000-0000-4000-8000-0000000000e1';
const AGORA = new Date('2026-10-19T15:00:00Z');

function fake() {
  return {
    pracas: { findUnique: jest.fn().mockResolvedValue({ id: PRACA, lat: -23.6, lon: -46.66 }) },
    field_consultants: { findFirst: jest.fn().mockResolvedValue({ id: CONS }) },
    field_areas: { findFirst: jest.fn().mockResolvedValue({ lat: -23.6, lng: -46.66, radius_m: 500 }) },
    $queryRaw: jest.fn().mockResolvedValue([]),
  };
}
const svc = (p: ReturnType<typeof fake>) => new HeatmapService(p as unknown as PrismaService);
const q = (o: Partial<HeatmapQueryDto> = {}): HeatmapQueryDto => ({ praca_id: PRACA, ...o }) as HeatmapQueryDto;
const falha = async (f: () => Promise<unknown>) => f().then(() => null, (e: unknown) => e);
const status = (e: unknown) => (e as { getStatus: () => number }).getStatus();
const codigo = (e: unknown) => ((e as { getResponse: () => { code: string } }).getResponse()).code;
const sqlDe = (p: ReturnType<typeof fake>, k: number) => p.$queryRaw.mock.calls[k][0] as Prisma.Sql;

describe('HeatmapService — isolamento por praça e validação', () => {
  it('praça inexistente, consultor ou área de OUTRA praça → 404 igual ao inexistente', async () => {
    const p = fake();
    p.pracas.findUnique.mockResolvedValue(null);
    expect(status(await falha(() => svc(p).heatmap(q(), AGORA)))).toBe(404);
    const p2 = fake();
    p2.field_consultants.findFirst.mockResolvedValue(null);
    const e1 = await falha(() => svc(p2).heatmap(q({ consultant_id: CONS }), AGORA));
    expect(status(e1)).toBe(404);
    expect(p2.field_consultants.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: CONS, praca_id: PRACA } }));
    const p3 = fake();
    p3.field_areas.findFirst.mockResolvedValue(null);
    expect(status(await falha(() => svc(p3).heatmap(q({ area_id: AREA }), AGORA)))).toBe(404);
    expect(p3.field_areas.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: AREA, praca_id: PRACA } }));
    expect(p3.$queryRaw).not.toHaveBeenCalled();
  });

  it('toda consulta leva a praça como parâmetro (nunca um filtro de praça ausente)', async () => {
    for (const layer of ['visitas', 'passagem', 'cobertura'] as const) {
      const p = fake();
      await svc(p).heatmap(q({ layer }), AGORA);
      for (let k = 0; k < p.$queryRaw.mock.calls.length; k++) expect(sqlDe(p, k).values).toContain(PRACA);
    }
  });

  it('período inválido ou maior que 92 dias e bbox ruim → 400 VALIDATION_ERROR sem tocar no banco', async () => {
    const p = fake();
    for (const o of [{ from: '2026-10-19', to: '2026-10-01' }, { from: '2026-01-01', to: '2026-10-19' }, { bbox: 'x,y,z,w' }, { bbox: '-30,-50,-20,-40' }]) {
      const e = await falha(() => svc(p).heatmap(q(o), AGORA));
      expect(status(e)).toBe(400);
      expect(codigo(e)).toBe('VALIDATION_ERROR');
    }
    expect(p.$queryRaw).not.toHaveBeenCalled();
  });

  it('padrão: hoje no dia de Brasília (21h BRT ainda é o mesmo dia, apesar do UTC já virado)', async () => {
    const p = fake();
    const r = await svc(p).heatmap(q({ layer: 'passagem' }), new Date('2026-10-20T00:30:00Z'));
    expect(r.from).toBe('2026-10-19');
    expect(r.to).toBe('2026-10-19');
  });
});

describe('HeatmapService — camadas', () => {
  it('visitas: só centro de célula + contagens; sem id de visita/lead nem coordenada crua', async () => {
    const p = fake();
    p.$queryRaw
      .mockResolvedValueOnce([{ i: -10509, j: -18981, n: 4, leads: 3 }])
      .mockResolvedValueOnce([{ id: CONS, name: 'Ana', visits: 4, leads: 3 }])
      .mockResolvedValueOnce([{ leads: 3 }]);
    const r = await svc(p).heatmap(q({ layer: 'visitas', consultant_id: CONS }), AGORA);
    expect(Object.keys(r.cells[0]).sort()).toEqual(['lat', 'leads', 'lng', 'n']);
    expect(r.summary).toEqual({ visits: 4, leads: 3, consultants: [{ id: CONS, name: 'Ana', visits: 4 }] });
    expect(r.max).toBe(4);
    expect(r.consultant_id).toBe(CONS);
    expect(sqlDe(p, 0).values).toContain(CONS);
  });

  it('passagem: minutos = pontos track × 5 (aproximado) e traz o aviso', async () => {
    const p = fake();
    p.$queryRaw.mockResolvedValueOnce([{ i: 1, j: 1, n: 5, tracks: 3 }]).mockResolvedValueOnce([{ points: 9, tracks: 6 }]);
    const r = await svc(p).heatmap(q({ layer: 'passagem' }), AGORA);
    expect(r.layer === 'passagem' && r.cells[0]).toMatchObject({ n: 5, minutes: 15 });
    expect(r.summary).toEqual({ points: 9, minutes: 30 });
    expect(r.note).toMatch(/um ponto a cada 5 min/);
  });

  it('cobertura: n = falta visitar; célula toda visitada some; consultor NÃO filtra (cobertura é da praça)', async () => {
    const p = fake();
    p.$queryRaw
      .mockResolvedValueOnce([{ i: 1, j: 1, n: 0, total: 2, visited: 2 }, { i: 2, j: 2, n: 3, total: 5, visited: 2 }])
      .mockResolvedValueOnce([{ total: 140, visited: 87 }]);
    const r = await svc(p).heatmap(q({ layer: 'cobertura', consultant_id: CONS }), AGORA);
    expect(r.cells).toHaveLength(1);
    expect(r.cells[0]).toMatchObject({ n: 3, total: 5, visited: 2 });
    expect(r.summary).toEqual({ leads_total: 140, leads_visited: 87, leads_missing: 53, percent: 62 });
    expect(r.consultant_id).toBeNull();
    for (let k = 0; k < 2; k++) expect(sqlDe(p, k).values).not.toContain(CONS);
    expect(sqlDe(p, 0).sql).toContain("location_precision IN ('point', 'address')");
  });

  it('o resumo ignora o bbox (é do filtro inteiro), a grade usa o bbox', async () => {
    const p = fake();
    await svc(p).heatmap(q({ layer: 'cobertura', bbox: '-23.62,-46.68,-23.58,-46.64' }), AGORA);
    expect(sqlDe(p, 0).values).toContain(-23.62);
    expect(sqlDe(p, 1).values).not.toContain(-23.62);
  });
});

describe('HeatmapService — volume', () => {
  const muitas = (n: number) => Array.from({ length: n }, (_, k) => ({ i: k, j: 0, n: 1, leads: 1 }));

  it('estourou o teto: refaz com célula maior e informa o tamanho usado', async () => {
    const p = fake();
    p.$queryRaw.mockResolvedValueOnce(muitas(MAX_CELULAS + 1)).mockResolvedValueOnce(muitas(10));
    const r = await svc(p).heatmap(q({ cell_m: 100 }), AGORA);
    expect(r.requested_cell_m).toBe(100);
    expect(r.cell.m).toBe(250);
    expect(r.truncated).toBe(false);
  });

  it('estourou até na maior célula: corta no teto e marca truncated', async () => {
    const p = fake();
    p.$queryRaw.mockResolvedValue(muitas(MAX_CELULAS + 1));
    const r = await svc(p).heatmap(q({ cell_m: 500 }), AGORA);
    expect(r.cell.m).toBe(1000);
    expect(r.cells).toHaveLength(MAX_CELULAS);
    expect(r.truncated).toBe(true);
  });
});

describe('Acesso e DTO', () => {
  it('rota só da equipe: sem @AdminOnly (não admin lê) e sem @CampoRoute (consultor → 401)', () => {
    const h = ConsultoresController.prototype.heat;
    expect(Reflect.getMetadata(ADMIN_ONLY_KEY, h)).toBeUndefined();
    expect(Reflect.getMetadata(CAMPO_ROUTE_KEY, h)).toBeUndefined();
  });

  it('DTO: praça obrigatória uuid, camada e célula numa lista fechada', async () => {
    const ok = async (o: object) => (await validate(plainToInstance(HeatmapQueryDto, o))).length === 0;
    expect(await ok({ praca_id: PRACA })).toBe(true);
    expect(await ok({})).toBe(false);
    expect(await ok({ praca_id: 'x' })).toBe(false);
    expect(await ok({ praca_id: PRACA, layer: 'gps' })).toBe(false);
    expect(await ok({ praca_id: PRACA, cell_m: '7' })).toBe(false);
    expect(await ok({ praca_id: PRACA, cell_m: '100', from: '2026-02-31' })).toBe(false);
    expect(await ok({ praca_id: PRACA, cell_m: '100', layer: 'cobertura', from: '2026-10-01' })).toBe(true);
  });
});
