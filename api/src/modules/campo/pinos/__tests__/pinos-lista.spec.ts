/** Clientes > Lista (contrato §34.6, lote E): a mesma situação do mapa, com os sem localização; contagem antes do filtro. */
import { ValidationPipe } from '@nestjs/common';
import type { PrismaService } from '../../../../common/database/prisma.service';
import { PinosListaQueryDto } from '../pinos.dto';
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
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } });
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
