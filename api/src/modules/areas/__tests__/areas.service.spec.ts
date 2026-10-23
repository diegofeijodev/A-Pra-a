import { Prisma } from '@prisma/client';
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { AuthUser } from '../../../common/auth/auth-user';
import type { PrismaService } from '../../../common/database/prisma.service';
import { ADMIN_ONLY_KEY, PERMISSAO_KEY } from '../../../common/decorators/admin-only.decorator';
import { AreasController } from '../areas.controller';
import { AreasService } from '../areas.service';
import { CreateAreaDto, UpdateAreaDto } from '../dto/areas.dto';

const PRACA_A = '00000000-0000-4000-8000-0000000000aa';
const PRACA_B = '00000000-0000-4000-8000-0000000000bb';
const AREA = '00000000-0000-4000-8000-0000000000cc';
const ADMIN: AuthUser = { id: '00000000-0000-4000-8000-0000000000dd', email: 'a@a.com', name: 'A', is_admin: true };

const row = (over: Record<string, unknown> = {}) => ({
  id: AREA,
  praca_id: PRACA_A,
  name: 'Moema',
  name_key: 'moema',
  lat: -23.6021,
  lng: -46.6658,
  radius_m: 1500,
  active: true,
  created_by: ADMIN.id,
  created_at: new Date('2026-10-19T14:00:00Z'),
  ...over,
});

function setup(over: { praca?: unknown; findFirst?: jest.Mock } = {}) {
  const field_areas = {
    findMany: jest.fn().mockResolvedValue([row()]),
    findFirst: over.findFirst ?? jest.fn().mockResolvedValue(null),
    create: jest.fn().mockImplementation(({ data }) => Promise.resolve(row(data))),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  };
  const pracas = {
    findUnique: jest.fn().mockResolvedValue('praca' in over ? over.praca : { id: PRACA_A }),
  };
  const service = new AreasService({ field_areas, pracas } as unknown as PrismaService);
  return { service, field_areas, pracas };
}

describe('AreasService.create — Moema: praça aberta sem IBGE ganha área', () => {
  it('cria a área (nome aparado, chave sem acento) e devolve a view em snake_case', async () => {
    const { service, field_areas } = setup();
    const v = await service.create(
      { praca_id: PRACA_A, name: '  Moema ', lat: -23.6021, lng: -46.6658, radius_m: 1500 },
      ADMIN,
    );
    expect(field_areas.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ praca_id: PRACA_A, name: 'Moema', name_key: 'moema', created_by: ADMIN.id }),
    });
    expect(v).toEqual({
      id: AREA,
      praca_id: PRACA_A,
      name: 'Moema',
      lat: -23.6021,
      lng: -46.6658,
      radius_m: 1500,
      active: true,
      created_at: '2026-10-19T14:00:00.000Z',
    });
  });

  it('centro fora do Brasil => 400 VALIDATION_ERROR e nada gravado', async () => {
    const { service, field_areas } = setup();
    await expect(
      service.create({ praca_id: PRACA_A, name: 'Lisboa', lat: 38.7, lng: -9.1, radius_m: 500 }, ADMIN),
    ).rejects.toMatchObject({ status: 400, response: { code: 'VALIDATION_ERROR' } });
    expect(field_areas.create).not.toHaveBeenCalled();
  });

  it.each([199, 5001])('raio %i => 400', async (radius_m) => {
    const { service } = setup();
    await expect(
      service.create({ praca_id: PRACA_A, name: 'X', lat: -23.6, lng: -46.66, radius_m }, ADMIN),
    ).rejects.toMatchObject({ status: 400, response: { code: 'VALIDATION_ERROR' } });
  });

  it('nome só com espaços => 400', async () => {
    const { service } = setup();
    await expect(
      service.create({ praca_id: PRACA_A, name: '   ', lat: -23.6, lng: -46.66, radius_m: 500 }, ADMIN),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('praça inexistente ou id malformado => 404 NOT_FOUND', async () => {
    const dto = { name: 'X', lat: -23.6, lng: -46.66, radius_m: 500 };
    await expect(setup({ praca: null }).service.create({ ...dto, praca_id: PRACA_B }, ADMIN)).rejects.toMatchObject({
      status: 404,
      response: { code: 'NOT_FOUND' },
    });
    const { service, pracas } = setup();
    await expect(service.create({ ...dto, praca_id: 'abc' }, ADMIN)).rejects.toMatchObject({ status: 404 });
    expect(pracas.findUnique).not.toHaveBeenCalled();
  });

  it('nome repetido na praça (ignorando acento e caixa) => 409 AREA_NAME_TAKEN', async () => {
    const { service, field_areas } = setup({ findFirst: jest.fn().mockResolvedValue({ id: 'x' }) });
    await expect(
      service.create({ praca_id: PRACA_A, name: 'MÓEMA', lat: -23.6, lng: -46.66, radius_m: 500 }, ADMIN),
    ).rejects.toMatchObject({ status: 409, response: { code: 'AREA_NAME_TAKEN' } });
    expect(field_areas.create).not.toHaveBeenCalled();
  });

  it('corrida no índice único (P2002) também vira 409, não 500', async () => {
    const { service, field_areas } = setup();
    field_areas.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: '5.22.0' }),
    );
    await expect(
      service.create({ praca_id: PRACA_A, name: 'Moema', lat: -23.6, lng: -46.66, radius_m: 500 }, ADMIN),
    ).rejects.toMatchObject({ status: 409, response: { code: 'AREA_NAME_TAKEN' } });
  });
});

describe('AreasService.list', () => {
  it('lista só as áreas da praça pedida', async () => {
    const { service, field_areas } = setup();
    const r = await service.list(PRACA_A);
    expect(r).toHaveLength(1);
    expect(field_areas.findMany).toHaveBeenCalledWith({ where: { praca_id: PRACA_A }, orderBy: { created_at: 'asc' } });
  });

  it('praça inexistente => 404', async () => {
    await expect(setup({ praca: null }).service.list(PRACA_B)).rejects.toMatchObject({ status: 404 });
  });
});

describe('AreasService.update — área de outra praça é 404', () => {
  it('a busca sempre leva {id, praca_id}; área da praça B pedida pela A => 404 e nada escrito', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const { service, field_areas } = setup({ findFirst });
    await expect(service.update(AREA, PRACA_B, { name: 'Roubada' })).rejects.toMatchObject({
      status: 404,
      response: { code: 'NOT_FOUND' },
    });
    expect(findFirst).toHaveBeenCalledWith({ where: { id: AREA, praca_id: PRACA_B } });
    expect(field_areas.updateMany).not.toHaveBeenCalled();
  });

  it('id ou praça_id malformado => 404 sem tocar no banco', async () => {
    const { service, field_areas } = setup();
    await expect(service.update('x', PRACA_A, {})).rejects.toMatchObject({ status: 404 });
    await expect(service.update(AREA, 'x', {})).rejects.toMatchObject({ status: 404 });
    expect(field_areas.findFirst).not.toHaveBeenCalled();
  });

  it('a escrita também é escopada pela praça e `active` ausente não é enviado', async () => {
    const findFirst = jest.fn().mockResolvedValue(row());
    const { service, field_areas } = setup({ findFirst });
    await service.update(AREA, PRACA_A, { radius_m: 800 });
    expect(field_areas.updateMany).toHaveBeenCalledWith({
      where: { id: AREA, praca_id: PRACA_A },
      data: { lat: -23.6021, lng: -46.6658, radius_m: 800, active: undefined },
    });
  });

  it('desativar manda active:false', async () => {
    const { service, field_areas } = setup({ findFirst: jest.fn().mockResolvedValue(row()) });
    await service.update(AREA, PRACA_A, { active: false });
    expect(field_areas.updateMany.mock.calls[0]![0].data.active).toBe(false);
  });

  it('o conjunto final é validado: mover só o lat para fora do Brasil => 400', async () => {
    const { service, field_areas } = setup({ findFirst: jest.fn().mockResolvedValue(row()) });
    await expect(service.update(AREA, PRACA_A, { lat: 40 })).rejects.toMatchObject({ status: 400 });
    expect(field_areas.updateMany).not.toHaveBeenCalled();
  });

  it('renomear para nome de outra área da praça => 409 (a própria área é excluída da checagem)', async () => {
    const findFirst = jest
      .fn()
      .mockResolvedValueOnce(row()) // a área
      .mockResolvedValueOnce({ id: 'outra' }); // conflito de nome
    const { service } = setup({ findFirst });
    await expect(service.update(AREA, PRACA_A, { name: 'Itaim' })).rejects.toMatchObject({
      status: 409,
      response: { code: 'AREA_NAME_TAKEN' },
    });
    expect(findFirst.mock.calls[1]![0].where).toEqual({
      praca_id: PRACA_A,
      name_key: 'itaim',
      id: { not: AREA },
    });
  });
});

describe('AreasController — permissões', () => {
  const marca = (m: keyof AreasController) => Reflect.getMetadata(ADMIN_ONLY_KEY, AreasController.prototype[m]);
  const permissao = (m: keyof AreasController) => Reflect.getMetadata(PERMISSAO_KEY, AreasController.prototype[m]);
  // Lote E §42.3: a escrita passou de só admin para gestor ou admin (com a flag desligada, continua só admin: matriz do gestor).
  it('escrita é @GestorOuAdmin; leitura é da equipe', () => {
    expect(permissao('create')).toBe('gestor');
    expect(permissao('update')).toBe('gestor');
    expect(marca('list')).toBeUndefined();
    expect(permissao('list')).toBeUndefined();
  });
});

describe('DTOs de área', () => {
  const erros = async (cls: new () => object, data: object) =>
    (await validate(plainToInstance(cls, data), { whitelist: true, forbidNonWhitelisted: true })).map((e) => e.property);

  it('criação válida passa; número em texto e radius decimal não', async () => {
    const ok = { praca_id: PRACA_A, name: 'Moema', lat: -23.6, lng: -46.66, radius_m: 1500 };
    expect(await erros(CreateAreaDto, ok)).toEqual([]);
    expect(await erros(CreateAreaDto, { ...ok, lat: '-23.6' })).toEqual(['lat']);
    expect(await erros(CreateAreaDto, { ...ok, radius_m: 10.5 })).toEqual(['radius_m']);
  });

  it('PATCH não aceita praca_id nem created_by; active sem default', async () => {
    expect(await erros(UpdateAreaDto, { praca_id: PRACA_B })).toEqual(['praca_id']);
    const dto = plainToInstance(UpdateAreaDto, {});
    expect(dto.active).toBeUndefined();
  });
});
