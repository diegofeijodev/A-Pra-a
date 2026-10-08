/**
 * Fotos das visitas — spec §10.
 *
 * Duas implementações atrás da mesma interface: **S3** (bucket privado, padrão em
 * produção) e **disco** (desenvolvimento). A foto nunca tem link público: quem
 * lê é a API, que confere quem pede.
 *
 * Bucket ou região faltando em modo `s3` não derruba o boot (o resto do Praça
 * continua de pé): as rotas de foto respondem 503, como o Freela sem conexão.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { BadGatewayException, Logger, ServiceUnavailableException } from '@nestjs/common';
import { DeleteObjectCommand, GetObjectCommand, NoSuchKey, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { Env } from '../../common/config/env.validation';

export type MimeImagem = 'image/jpeg' | 'image/png' | 'image/webp';

export interface FotoLida {
  bytes: Buffer;
  mime: string;
}

export interface PhotoStorage {
  put(key: string, bytes: Buffer, mime: string): Promise<void>;
  get(key: string): Promise<FotoLida | null>;
  remove(key: string): Promise<void>;
}

export const PHOTO_STORAGE = Symbol('PHOTO_STORAGE');

export const PHOTO_STORAGE_NOT_CONFIGURED_MESSAGE =
  'Armazenamento de fotos não configurado (PHOTO_STORAGE=s3 exige S3_BUCKET e S3_REGION).';

/**
 * Tipo real pelos bytes mágicos. O mimetype do multipart é o que o navegador
 * DIZ — um HEIC renomeado para .jpg chegaria como `image/jpeg`.
 */
export function tipoDaImagem(b: Buffer): MimeImagem | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

const EXT: Record<MimeImagem, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MIME_DA_EXT: Record<string, MimeImagem> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

export const CHAVE_FOTO_RE = /^campo\/[0-9a-f-]{36}\/\d{4}-\d{2}-\d{2}\/[0-9a-f-]{36}\.(jpg|png|webp)$/;

export function chaveDaFoto(consultantId: string, day: string, visitId: string, mime: MimeImagem): string {
  return `campo/${consultantId}/${day}/${visitId}.${EXT[mime]}`;
}

export function mimeDaChave(key: string): MimeImagem {
  return MIME_DA_EXT[key.slice(key.lastIndexOf('.') + 1)] ?? 'image/jpeg';
}

export class DiskPhotoStorage implements PhotoStorage {
  constructor(private readonly dir: string) {}

  private caminho(key: string): string {
    if (!CHAVE_FOTO_RE.test(key)) throw new Error(`chave de foto inválida: ${key}`);
    return path.join(path.resolve(this.dir), ...key.split('/'));
  }

  async put(key: string, bytes: Buffer, _mime: string): Promise<void> {
    const arquivo = this.caminho(key);
    await fs.mkdir(path.dirname(arquivo), { recursive: true });
    await fs.writeFile(arquivo, bytes);
  }

  async get(key: string): Promise<FotoLida | null> {
    try {
      return { bytes: await fs.readFile(this.caminho(key)), mime: mimeDaChave(key) };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw e;
    }
  }

  async remove(key: string): Promise<void> {
    const arquivo = this.caminho(key);
    await fs.rm(arquivo, { force: true });
    // As pastas do dia e do consultor que ficaram vazias saem junto: apagar um
    // consultor de teste não deixa árvore morta em `uploads/`.
    const raiz = path.resolve(this.dir);
    let pasta = path.dirname(arquivo);
    while (pasta.startsWith(raiz) && pasta !== raiz) {
      try {
        await fs.rmdir(pasta);
      } catch {
        break;
      }
      pasta = path.dirname(pasta);
    }
  }
}

export class S3PhotoStorage implements PhotoStorage {
  private readonly log = new Logger('PhotoStorage');

  constructor(
    private readonly bucket: string,
    private readonly client: S3Client,
  ) {}

  async put(key: string, bytes: Buffer, mime: string): Promise<void> {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: bytes,
          ContentType: mime,
          ServerSideEncryption: 'AES256',
        }),
      );
    } catch (e) {
      this.log.error(`S3 put falhou (${key}): ${e instanceof Error ? e.message : String(e)}`);
      throw new BadGatewayException({
        code: 'PHOTO_STORAGE_ERROR',
        message: 'Não foi possível guardar a foto agora — tente de novo.',
      });
    }
  }

  async get(key: string): Promise<FotoLida | null> {
    try {
      const r = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      if (!r.Body) return null;
      return { bytes: Buffer.from(await r.Body.transformToByteArray()), mime: r.ContentType ?? mimeDaChave(key) };
    } catch (e) {
      if (e instanceof NoSuchKey || (e as { name?: string }).name === 'NoSuchKey') return null;
      throw e;
    }
  }

  async remove(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

export class PhotoStorageNaoConfigurado implements PhotoStorage {
  private falhar(): never {
    throw new ServiceUnavailableException({
      code: 'PHOTO_STORAGE_NOT_CONFIGURED',
      message: PHOTO_STORAGE_NOT_CONFIGURED_MESSAGE,
    });
  }
  async put(): Promise<void> {
    return this.falhar();
  }
  async get(): Promise<FotoLida | null> {
    return this.falhar();
  }
  async remove(): Promise<void> {
    return this.falhar();
  }
}

type EnvFotos = Pick<
  Env,
  'PHOTO_STORAGE' | 'PHOTOS_DIR' | 'S3_BUCKET' | 'S3_REGION' | 'AWS_ACCESS_KEY_ID' | 'AWS_SECRET_ACCESS_KEY'
>;

export function criarPhotoStorage(env: EnvFotos, log = new Logger('PhotoStorage')): PhotoStorage {
  if (env.PHOTO_STORAGE === 'disk') return new DiskPhotoStorage(env.PHOTOS_DIR);
  if (!env.S3_BUCKET || !env.S3_REGION) {
    log.warn(PHOTO_STORAGE_NOT_CONFIGURED_MESSAGE);
    return new PhotoStorageNaoConfigurado();
  }
  const credentials =
    env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY
      ? { accessKeyId: env.AWS_ACCESS_KEY_ID, secretAccessKey: env.AWS_SECRET_ACCESS_KEY }
      : undefined;
  return new S3PhotoStorage(env.S3_BUCKET, new S3Client({ region: env.S3_REGION, ...(credentials ? { credentials } : {}) }));
}
