import type { PrismaService } from '../../../common/database/prisma.service';
import type { CampoFreelaService } from '../campo-freela.service';
import { ConsultoresService } from '../consultores.service';
import type { PhotoStorage } from '../photo-storage';

const CONS = '44444444-4444-4444-8444-444444444444';
const VISITA = '55555555-5555-4555-8555-555555555555';

function montar() {
  const p = {
    field_consultants: { findUnique: jest.fn().mockResolvedValue({ id: CONS, praca: { name: 'BH' } }) },
    field_journeys: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'j1', client_id: 'c', day: '2026-10-08', started_at: new Date('2026-10-08T12:00:00.000Z'),
          start_lat: -19.92, start_lng: -43.93, ended_at: null, end_lat: null, end_lng: null, auto_closed: false,
          points: [
            { id: 'p1', at: new Date('2026-10-08T12:00:00.000Z'), lat: -19.92, lng: -43.93, accuracy: 10, kind: 'start', clock_adjusted: false },
          ],
        },
      ]),
    },
    field_visits: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue({ photo_key: `campo/${CONS}/2026-10-08/${VISITA}.jpg` }),
    },
    field_routes: { findUnique: jest.fn().mockResolvedValue(null) },
    app_settings: {
      findUnique: jest.fn().mockResolvedValue({ field_channels: ['Nenhum', 'iFood'] }),
      upsert: jest.fn().mockResolvedValue({}),
    },
  };
  const fotos = { get: jest.fn().mockResolvedValue({ bytes: Buffer.from([1]), mime: 'image/jpeg' }), put: jest.fn(), remove: jest.fn() };
  const s = new ConsultoresService(p as unknown as PrismaService, {} as CampoFreelaService, fotos as unknown as PhotoStorage);
  return { p, s, fotos };
}

describe('ConsultoresService — leitura da equipe', () => {
  it('dia: jornadas com os pontos em ordem e visitas do dia', async () => {
    const { p, s } = montar();
    const r = await s.day(CONS, '2026-10-08');

    expect(p.field_journeys.findMany).toHaveBeenCalledWith({
      where: { consultant_id: CONS, day: '2026-10-08' },
      orderBy: { started_at: 'asc' },
      include: { points: { orderBy: { at: 'asc' } } },
    });
    expect(r.day).toBe('2026-10-08');
    expect(r.journeys[0]).toMatchObject({ id: 'j1', points: [{ id: 'p1', kind: 'start', at: '2026-10-08T12:00:00.000Z' }] });
    expect(r.visits).toEqual([]);
    expect(r.stops).toEqual([]);
    expect(r.route).toBeNull();
  });

  it('dia inexistente no calendário = 400 VALIDATION_ERROR', async () => {
    await expect(montar().s.day(CONS, '2026-02-31')).rejects.toMatchObject({ response: { code: 'VALIDATION_ERROR' } });
  });

  it('foto pela equipe; id malformado = 404 sem consultar', async () => {
    const { p, s } = montar();
    expect(await s.photo(VISITA)).toEqual({ bytes: Buffer.from([1]), mime: 'image/jpeg' });
    await expect(s.photo('nao-e-uuid')).rejects.toMatchObject({ response: { code: 'NOT_FOUND' } });
    expect(p.field_visits.findUnique).toHaveBeenCalledTimes(1);
  });

  it('foto que sumiu do armazenamento = 404', async () => {
    const { s, fotos } = montar();
    fotos.get.mockResolvedValue(null);
    await expect(s.photo(VISITA)).rejects.toMatchObject({ response: { code: 'NOT_FOUND' } });
  });

  it('visita inexistente = 404', async () => {
    const { p, s } = montar();
    p.field_visits.findUnique.mockResolvedValue(null);
    await expect(s.photo(VISITA)).rejects.toMatchObject({ response: { code: 'NOT_FOUND' } });
  });

  it('armazenamento que falha = 502 PHOTO_STORAGE_ERROR; HttpException (503) passa direto', async () => {
    const { s, fotos } = montar();
    fotos.get.mockRejectedValue(new Error('boom'));
    await expect(s.photo(VISITA)).rejects.toMatchObject({ status: 502, response: { code: 'PHOTO_STORAGE_ERROR' } });
    const { ServiceUnavailableException } = await import('@nestjs/common');
    fotos.get.mockRejectedValue(new ServiceUnavailableException({ code: 'PHOTO_STORAGE_NOT_CONFIGURED' }));
    await expect(s.photo(VISITA)).rejects.toMatchObject({ status: 503 });
  });

  it('canais: lê a lista e grava aparando e sem repetir (sem diferenciar caixa)', async () => {
    const { p, s } = montar();
    expect(await s.channels()).toEqual({ channels: ['Nenhum', 'iFood'] });

    expect(await s.setChannels({ channels: [' iFood ', 'ifood', 'Indeed'] })).toEqual({ channels: ['iFood', 'Indeed'] });
    expect(p.app_settings.upsert).toHaveBeenCalledWith({
      where: { id: 1 },
      update: { field_channels: ['iFood', 'Indeed'] },
      create: { id: 1, field_channels: ['iFood', 'Indeed'] },
    });
  });

  it('canais só com espaços = 400', async () => {
    await expect(montar().s.setChannels({ channels: ['  '] })).rejects.toMatchObject({ response: { code: 'VALIDATION_ERROR' } });
  });

  it('canais: item de 81 caracteres após aparar = 400', async () => {
    await expect(montar().s.setChannels({ channels: ['x'.repeat(81)] })).rejects.toMatchObject({ response: { code: 'VALIDATION_ERROR' } });
  });
});
