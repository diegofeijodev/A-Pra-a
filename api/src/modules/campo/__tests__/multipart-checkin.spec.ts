import type { FastifyRequest } from 'fastify';
import { lerCheckinMultipart } from '../multipart-checkin';

const CLIENT = '77777777-7777-4777-8777-777777777777';
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);

const campo = (fieldname: string, value: string) => ({ type: 'field', fieldname, value });
const arquivo = (bytes: Buffer | Error, fieldname = 'photo') => ({
  type: 'file',
  fieldname,
  toBuffer: async () => {
    if (bytes instanceof Error) throw bytes;
    return bytes;
  },
});

function req(partes: Record<string, unknown>[], multipart = true): FastifyRequest {
  return {
    isMultipart: () => multipart,
    parts: async function* () {
      for (const p of partes) yield p;
    },
  } as unknown as FastifyRequest;
}

const BASE = [
  campo('client_id', CLIENT),
  campo('at', '2026-10-08T14:59:00.000Z'),
  campo('lat', '-19.9245'),
  campo('lng', '-43.9352'),
  campo('accuracy', '12'),
];

describe('lerCheckinMultipart', () => {
  it('campos de texto viram números/booleano/objeto e a foto vem inteira', async () => {
    const r = await lerCheckinMultipart(
      req([...BASE, campo('new_place', '{"name":"Bar Novo","address":"Rua A, 1"}'), campo('confirm_new', 'true'), arquivo(JPEG)]),
    );
    expect(r.foto).toEqual(JPEG);
    expect(r.campos).toMatchObject({ client_id: CLIENT, lat: -19.9245, lng: -43.9352, accuracy: 12, confirm_new: true });
    expect(r.campos.new_place).toMatchObject({ name: 'Bar Novo', address: 'Rua A, 1' });
  });

  it('sem foto = 400 FILE_REQUIRED', async () => {
    await expect(lerCheckinMultipart(req(BASE))).rejects.toMatchObject({ response: { code: 'FILE_REQUIRED' } });
  });

  it('foto acima de 5 MB = 413 FILE_TOO_LARGE', async () => {
    const grande = Object.assign(new Error('request file too large'), { code: 'FST_REQ_FILE_TOO_LARGE' });
    await expect(lerCheckinMultipart(req([...BASE, arquivo(grande)]))).rejects.toMatchObject({
      status: 413,
      response: { code: 'FILE_TOO_LARGE' },
    });
  });

  it('campo fora do DTO = 400 VALIDATION_ERROR (mesma regra do whitelist global)', async () => {
    await expect(lerCheckinMultipart(req([...BASE, campo('praca_id', 'x'), arquivo(JPEG)]))).rejects.toMatchObject({
      response: { code: 'VALIDATION_ERROR' },
    });
  });

  it('new_place que não é JSON = 400', async () => {
    await expect(lerCheckinMultipart(req([...BASE, campo('new_place', '{quebrado'), arquivo(JPEG)]))).rejects.toMatchObject({
      response: { code: 'VALIDATION_ERROR', message: 'new_place: JSON inválido.' },
    });
  });

  it('corpo que não é multipart = 400', async () => {
    await expect(lerCheckinMultipart(req([], false))).rejects.toMatchObject({ response: { code: 'VALIDATION_ERROR' } });
  });
});
