import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BadGatewayException, ServiceUnavailableException } from '@nestjs/common';
import { DeleteObjectCommand, GetObjectCommand, NoSuchKey, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import {
  chaveDaFoto,
  criarPhotoStorage,
  DiskPhotoStorage,
  mimeDaChave,
  PhotoStorageNaoConfigurado,
  prefixoS3,
  S3PhotoStorage,
  tipoDaImagem,
} from '../photo-storage';

const CONS = '44444444-4444-4444-8444-444444444444';
const VISITA = '55555555-5555-4555-8555-555555555555';
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([1, 2, 3, 4]), Buffer.from('WEBPVP8 ')]);
const HEIC = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypheic'), Buffer.alloc(8)]);

describe('tipoDaImagem — pelos bytes, não pelo mimetype declarado', () => {
  it.each([
    ['JPEG', JPEG, 'image/jpeg'],
    ['PNG', PNG, 'image/png'],
    ['WEBP', WEBP, 'image/webp'],
    ['HEIC do iPhone', HEIC, null],
    ['texto', Buffer.from('nao e imagem'), null],
    ['vazio', Buffer.alloc(0), null],
  ])('%s', (_nome, bytes, esperado) => {
    expect(tipoDaImagem(bytes as Buffer)).toBe(esperado);
  });
});

describe('chave da foto', () => {
  it('campo/<consultor>/<dia>/<visita>.<ext> e o mime de volta pela extensão', () => {
    const k = chaveDaFoto(CONS, '2026-10-08', VISITA, 'image/png');
    expect(k).toBe(`campo/${CONS}/2026-10-08/${VISITA}.png`);
    expect(mimeDaChave(k)).toBe('image/png');
    expect(mimeDaChave(chaveDaFoto(CONS, '2026-10-08', VISITA, 'image/jpeg'))).toBe('image/jpeg');
  });
});

describe('DiskPhotoStorage', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'praca-fotos-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('guarda, lê e apaga (levando as pastas que ficaram vazias)', async () => {
    const s = new DiskPhotoStorage(dir);
    const k = chaveDaFoto(CONS, '2026-10-08', VISITA, 'image/jpeg');

    await s.put(k, JPEG, 'image/jpeg');
    expect(await s.get(k)).toEqual({ bytes: JPEG, mime: 'image/jpeg' });

    await s.remove(k);
    expect(await s.get(k)).toBeNull();
    expect(await readdir(dir)).toEqual([]);
  });

  it('chave fora do formato (../) é recusada antes de tocar no disco', async () => {
    const s = new DiskPhotoStorage(dir);
    await expect(s.put('../../etc/passwd', JPEG, 'image/jpeg')).rejects.toThrow('chave de foto inválida');
  });
});

describe('S3PhotoStorage', () => {
  const k = chaveDaFoto(CONS, '2026-10-08', VISITA, 'image/jpeg');

  it('put manda o objeto privado com tipo e criptografia', async () => {
    const send = jest.fn().mockResolvedValue({});
    await new S3PhotoStorage('fotos-praca', { send } as unknown as S3Client).put(k, JPEG, 'image/jpeg');

    const cmd = send.mock.calls[0]![0] as PutObjectCommand;
    expect(cmd).toBeInstanceOf(PutObjectCommand);
    expect(cmd.input).toMatchObject({
      Bucket: 'fotos-praca',
      Key: k,
      ContentType: 'image/jpeg',
      ServerSideEncryption: 'AES256',
    });
  });

  it('get devolve os bytes; objeto inexistente = null', async () => {
    const send = jest
      .fn()
      .mockResolvedValueOnce({ ContentType: 'image/jpeg', Body: { transformToByteArray: async () => new Uint8Array(JPEG) } })
      .mockRejectedValueOnce(new NoSuchKey({ message: 'não existe', $metadata: {} }));
    const s = new S3PhotoStorage('fotos-praca', { send } as unknown as S3Client);

    expect(await s.get(k)).toEqual({ bytes: JPEG, mime: 'image/jpeg' });
    expect(send.mock.calls[0]![0]).toBeInstanceOf(GetObjectCommand);
    expect(await s.get(k)).toBeNull();
  });

  it('falha do S3 ao guardar vira 502 PHOTO_STORAGE_ERROR (a fila do celular tenta de novo)', async () => {
    const send = jest.fn().mockRejectedValue(new Error('timeout'));
    const erro = await new S3PhotoStorage('fotos-praca', { send } as unknown as S3Client)
      .put(k, JPEG, 'image/jpeg')
      .catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(BadGatewayException);
    expect((erro as BadGatewayException).getResponse()).toMatchObject({ code: 'PHOTO_STORAGE_ERROR' });
  });

  it('remove apaga o objeto', async () => {
    const send = jest.fn().mockResolvedValue({});
    await new S3PhotoStorage('fotos-praca', { send } as unknown as S3Client).remove(k);
    expect(send.mock.calls[0]![0]).toBeInstanceOf(DeleteObjectCommand);
  });

  it('com prefixo (bucket do Freela), put/get/remove usam praca/<chave>; quem chama segue com a chave do banco', async () => {
    const send = jest
      .fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ Body: { transformToByteArray: async () => new Uint8Array(JPEG) }, ContentType: 'image/jpeg' })
      .mockResolvedValueOnce({});
    const s = new S3PhotoStorage('freela-uploads', { send } as unknown as S3Client, 'praca/');

    await s.put(k, JPEG, 'image/jpeg');
    await expect(s.get(k)).resolves.toEqual({ bytes: JPEG, mime: 'image/jpeg' });
    await s.remove(k);

    const comandos = send.mock.calls.map((c) => c[0] as PutObjectCommand | GetObjectCommand | DeleteObjectCommand);
    expect(comandos.map((c) => c.constructor)).toEqual([PutObjectCommand, GetObjectCommand, DeleteObjectCommand]);
    for (const c of comandos) expect(c.input).toMatchObject({ Bucket: 'freela-uploads', Key: `praca/${k}` });
  });
});

describe('prefixoS3', () => {
  it.each([
    ['', ''],
    ['  ', ''],
    ['/', ''],
    ['praca', 'praca/'],
    ['praca/', 'praca/'],
    ['/praca//', 'praca/'],
    ['apps/praca', 'apps/praca/'],
  ])('%j → %j', (entrada, saida) => {
    expect(prefixoS3(entrada)).toBe(saida);
  });
});

describe('criarPhotoStorage', () => {
  const base = {
    PHOTOS_DIR: './uploads',
    S3_BUCKET: '',
    S3_REGION: '',
    S3_PREFIX: '',
    AWS_ACCESS_KEY_ID: '',
    AWS_SECRET_ACCESS_KEY: '',
  };

  it('disk → disco', () => {
    expect(criarPhotoStorage({ ...base, PHOTO_STORAGE: 'disk' })).toBeInstanceOf(DiskPhotoStorage);
  });

  it('s3 sem bucket/região sobe, mas responde 503 PHOTO_STORAGE_NOT_CONFIGURED', async () => {
    const s = criarPhotoStorage({ ...base, PHOTO_STORAGE: 's3' });
    expect(s).toBeInstanceOf(PhotoStorageNaoConfigurado);
    const erro = await s.put('x', JPEG, 'image/jpeg').catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ServiceUnavailableException);
    expect((erro as ServiceUnavailableException).getResponse()).toMatchObject({ code: 'PHOTO_STORAGE_NOT_CONFIGURED' });
  });

  it('s3 completo → S3 (chaves vazias = cadeia padrão do SDK)', () => {
    expect(criarPhotoStorage({ ...base, PHOTO_STORAGE: 's3', S3_BUCKET: 'fotos', S3_REGION: 'sa-east-1' })).toBeInstanceOf(
      S3PhotoStorage,
    );
  });
});
