/** Clientes > Lista (contrato §34.6, lote E): a mesma situação do mapa, com os sem localização; contagem antes do filtro. */
import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import type { PrismaService } from '../../../../common/database/prisma.service';
import { CAMPO_ROUTE_KEY } from '../../../../common/decorators/campo-route.decorator';
import { rotasDoApp } from '../../../../common/__tests__/rotas-do-app';
import { MapPinsLigadoGuard } from '../../painel/lovable.guards';
import { PinosListaCampoController, PinosListaController } from '../pinos.controller';
import { PinosListaCampoQueryDto, PinosListaQueryDto } from '../pinos.dto';
import { montarLista, PinosService } from '../pinos.service';

const base = { stage: 1, decl: false, tem_visita: false, outcome: null, result: null, freela_status: null, needs_followup: null, refusal_reason: null };
const linha = (id: string, over: Record<string, unknown> = {}) => ({
  ...base,
  id,
  name: `Lugar ${id}`,
  address: 'Rua X',
  city: 'BH',
  praca_id: 'p1',
  phone: '31988887777',
  lat: -19.9 as number | null,
  lng: -43.9 as number | null,
  dia: null as string | null,
  consultor: null as string | null,
  ...over,
});
const conta = (t: number, s: number) => `${t}/${s}`;
const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } });

describe('montarLista', () => {
  const linhas = [
    linha('a'),
    linha('b', { tem_visita: true, result: 'cadastrou', dia: '2026-10-22', consultor: 'Ana' }),
    linha('c', { lat: null, lng: null, tem_visita: true, result: 'sem_interesse' }),
    linha('d', { decl: true }),
  ];
  it('conta todas as situações (antes do filtro), os sem localização e filtra pelos códigos', () => {
    const r = montarLista({ pracas: [], linhas, codes: ['cadastrado'], limite: 10, cursor: null, conta });
    expect(r.counts).toMatchObject({ a_visitar: 1, cadastrado: 2, nao_cadastrado: 1 });
    expect(r.total).toBe(4);
    expect(r.without_location).toBe(1);
    expect(r.items.map((i) => i.id)).toEqual(['b', 'd']);
    expect(r.items[0]).toMatchObject({ code: 'cadastrado', label: 'Cadastrou', has_location: true, last_visit: { day: '2026-10-22', consultant_name: 'Ana' } });
    expect(r.conta).toBe('4/1');
  });
  it('telefone só mascarado; sem localização aparece na lista', () => {
    const r = montarLista({ pracas: [], linhas, codes: null, limite: 10, cursor: null, conta });
    expect(r.items.find((i) => i.id === 'c')).toMatchObject({ has_location: false, code: 'nao_cadastrado' });
    expect(JSON.stringify(r.items)).not.toContain('31988887777');
    expect(r.items[0]!.phone).toEqual({ masked: expect.stringContaining('****'), kind: 'whatsapp' });
  });
  it('página por cursor, na ordem que veio (nome, id)', () => {
    const p1 = montarLista({ pracas: [], linhas, codes: null, limite: 2, cursor: null, conta });
    expect(p1.items.map((i) => i.id)).toEqual(['a', 'b']);
    expect(p1.next_cursor).toBe('b');
    const p2 = montarLista({ pracas: [], linhas, codes: null, limite: 2, cursor: 'b', conta });
    expect(p2.items.map((i) => i.id)).toEqual(['c', 'd']);
    expect(p2.next_cursor).toBeNull();
  });
});

describe('PinosService.lista', () => {
  it('código desconhecido = 400; praça inexistente = 404; sem praças abertas = vazio sem consulta', async () => {
    const p = { pracas: { findUnique: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) }, $queryRaw: jest.fn() };
    const s = new PinosService(p as unknown as PrismaService);
    await expect(s.lista({ praca_id: '00000000-0000-4000-8000-0000000000aa' })).rejects.toMatchObject({ status: 404 });
    await expect(s.lista({ codes: 'xis' })).rejects.toMatchObject({ status: 400, response: { code: 'VALIDATION_ERROR' } });
    const r = await s.lista({});
    expect(r).toMatchObject({ total: 0, items: [], next_cursor: null });
    expect(p.$queryRaw).not.toHaveBeenCalled();
  });
  it('DTO: busca de 2–80 caracteres e limite até 500', async () => {
    await expect(pipe.transform({ q: 'a' }, { type: 'query', metatype: PinosListaQueryDto })).rejects.toBeDefined();
    await expect(pipe.transform({ limit: '501' }, { type: 'query', metatype: PinosListaQueryDto })).rejects.toBeDefined();
    await expect(pipe.transform({ q: 'pa', limit: '50', codes: 'a_visitar,cadastrado' }, { type: 'query', metatype: PinosListaQueryDto })).resolves.toMatchObject({ limit: 50 });
  });
});

/**
 * Lista do representante (contrato §34.7, redesenho E4): a base do §34.4 (roteiro dele ou visitado por ele, na praça ATIVA do
 * token) com a resposta do §34.6 sem `pracas`. Sem banco: confere o recorte pelo SQL que sai e pelos valores amarrados.
 */
describe('PinosService.listaConsultor (§34.7)', () => {
  const PRACA_A = 'aaaaaaaa-1111-4000-8000-00000000000a';
  const PRACA_B = 'bbbbbbbb-1111-4000-8000-00000000000b';
  const CONS_A = 'cccccccc-1111-4000-8000-00000000000a';
  const CONS_B = 'cccccccc-1111-4000-8000-00000000000b';
  const consultor = (id: string, praca_id: string, principal?: string) => ({
    id, name: 'X', email: 'x@x.com', praca_id, must_change_password: false, ...(principal ? { praca_principal_id: principal } : {}),
  });
  const fake = (linhas: unknown[] = [linha('a', { praca_id: PRACA_A }), linha('b', { praca_id: PRACA_A, tem_visita: true, result: 'cadastrou' })]) => ({
    pracas: { findUnique: jest.fn(), findMany: jest.fn() },
    $queryRaw: jest.fn().mockResolvedValue(linhas),
  });
  const sqlDe = (p: ReturnType<typeof fake>) => (p.$queryRaw.mock.calls[0]![0] as { strings: string[] }).strings.join('?');
  const valoresDe = (p: ReturnType<typeof fake>) => (p.$queryRaw.mock.calls[0]![0] as { values: unknown[] }).values;

  it('recorte do §34.4: roteiro dele OU visitado por ele, com o id do TOKEN (A × B: cada um só com o próprio id)', async () => {
    const pA = fake();
    await new PinosService(pA as unknown as PrismaService).listaConsultor(consultor(CONS_A, PRACA_A), {});
    expect(sqlDe(pA)).toContain('r.consultant_id =');
    expect(sqlDe(pA)).toContain('v2.consultant_id =');
    expect(valoresDe(pA).filter((v) => v === CONS_A)).toHaveLength(2);
    expect(valoresDe(pA)).not.toContain(CONS_B);

    const pB = fake();
    await new PinosService(pB as unknown as PrismaService).listaConsultor(consultor(CONS_B, PRACA_A), {});
    expect(valoresDe(pB).filter((v) => v === CONS_B)).toHaveLength(2);
    expect(valoresDe(pB)).not.toContain(CONS_A);
  });

  it('só a praça ATIVA do token (§44.4): com duas praças e a jornada em B, só B entra; a principal fica de fora', async () => {
    const p = fake([]);
    await new PinosService(p as unknown as PrismaService).listaConsultor(consultor(CONS_A, PRACA_B, PRACA_A), {});
    expect(valoresDe(p)).toContain(PRACA_B);
    expect(valoresDe(p)).not.toContain(PRACA_A);
    // Nunca a lista de praças abertas da equipe: a praça vem do token, sem consultar `pracas`.
    expect(p.pracas.findMany).not.toHaveBeenCalled();
    expect(p.pracas.findUnique).not.toHaveBeenCalled();
  });

  it('resposta = a do §34.6 sem `pracas`, com a mesma situação e telefone só mascarado', async () => {
    const r = await new PinosService(fake() as unknown as PrismaService).listaConsultor(consultor(CONS_A, PRACA_A), {});
    expect(r).not.toHaveProperty('pracas');
    expect(r).toMatchObject({ total: 2, without_location: 0, counts: { a_visitar: 1, cadastrado: 1 }, next_cursor: null });
    expect(r.items.map((i) => [i.id, i.code])).toEqual([['a', 'a_visitar'], ['b', 'cadastrado']]);
    expect(JSON.stringify(r)).not.toContain('31988887777');
    expect(typeof r.conta).toBe('string');
  });

  it('busca e códigos como no §34.6: código desconhecido = 400 antes de consultar; a busca vai como parâmetro escapado', async () => {
    const p = fake();
    const s = new PinosService(p as unknown as PrismaService);
    await expect(s.listaConsultor(consultor(CONS_A, PRACA_A), { codes: 'xis' })).rejects.toMatchObject({ status: 400, response: { code: 'VALIDATION_ERROR' } });
    expect(p.$queryRaw).not.toHaveBeenCalled();
    const r = await s.listaConsultor(consultor(CONS_A, PRACA_A), { q: '50%', codes: 'cadastrado' });
    expect(valoresDe(p)).toContain('%50\\%%');
    expect(r.items.map((i) => i.id)).toEqual(['b']);
    expect(r.counts).toMatchObject({ a_visitar: 1, cadastrado: 1 });
  });

  it('DTO: sem `praca_id` (vem do token) — mandar é 400; busca de 2–80 e limite até 500', async () => {
    await expect(pipe.transform({ praca_id: PRACA_B }, { type: 'query', metatype: PinosListaCampoQueryDto })).rejects.toBeDefined();
    await expect(pipe.transform({ q: 'a' }, { type: 'query', metatype: PinosListaCampoQueryDto })).rejects.toBeDefined();
    await expect(pipe.transform({ limit: '501' }, { type: 'query', metatype: PinosListaCampoQueryDto })).rejects.toBeDefined();
    await expect(pipe.transform({ q: 'pa', limit: '50', codes: 'a_visitar' }, { type: 'query', metatype: PinosListaCampoQueryDto })).resolves.toMatchObject({ limit: 50 });
  });

  it('rota do consultor (@CampoRoute) atrás da trava do mapa (MapPinsLigadoGuard → 404 MAP_PINS_DISABLED desligada)', () => {
    expect(Reflect.getMetadata(CAMPO_ROUTE_KEY, PinosListaCampoController)).toBeTruthy();
    expect(Reflect.getMetadata(PATH_METADATA, PinosListaCampoController)).toBe('v1/campo/map/list');
    expect(Reflect.getMetadata(GUARDS_METADATA, PinosListaCampoController)).toContain(MapPinsLigadoGuard);
    // A da equipe continua fechada para o consultor (sem @CampoRoute: token de consultor = 401).
    expect(Reflect.getMetadata(CAMPO_ROUTE_KEY, PinosListaController)).toBeFalsy();
    expect(() => new MapPinsLigadoGuard({ dashboard: false, day_summary: false, map_pins: false }).canActivate()).toThrow(
      expect.objectContaining({ status: 404, response: expect.objectContaining({ code: 'MAP_PINS_DISABLED' }) }),
    );
  });

  it('registrada no app: GET /v1/campo/map/list do consultor (e a da equipe segue sem @CampoRoute)', () => {
    const rotas = rotasDoApp();
    expect(rotas.filter((r) => r.caminho === '/v1/campo/map/list').map((r) => [r.metodo, r.campo])).toEqual([['GET', true]]);
    expect(rotas.filter((r) => r.caminho === '/v1/consultores/map/list').map((r) => [r.metodo, r.campo])).toEqual([['GET', false]]);
  });
});
