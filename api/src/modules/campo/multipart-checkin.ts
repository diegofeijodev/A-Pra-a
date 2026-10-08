/**
 * Check-in = campos + foto num multipart só (spec §6.1). Com o
 * `@fastify/multipart` registrado no `main.ts`, `@Body()` não serve: os campos
 * chegam como partes de texto. Lê TODAS as partes (a ordem campo/arquivo não
 * importa), consome o arquivo antes de qualquer consulta ao banco e valida o
 * resultado com a MESMA regra do `ValidationPipe` global (whitelist +
 * forbidNonWhitelisted).
 */
import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { FastifyRequest } from 'fastify';
import { flattenErrors } from '../../common/validation/flatten-errors';
import { CheckinDto } from './dto/campo.dto';

export interface CheckinMultipart {
  campos: CheckinDto;
  foto: Buffer;
}

const invalido = (message: string) => new BadRequestException({ code: 'VALIDATION_ERROR', message });

export async function lerCheckinMultipart(req: FastifyRequest): Promise<CheckinMultipart> {
  if (!req.isMultipart()) throw invalido('Envie o check-in como multipart/form-data (campos + foto).');

  const campos: Record<string, unknown> = {};
  let foto: Buffer | null = null;
  try {
    for await (const parte of req.parts()) {
      if (parte.type === 'file') {
        const bytes = await parte.toBuffer();
        if (parte.fieldname !== 'photo') throw invalido(`campo de arquivo inesperado: ${parte.fieldname}`);
        foto = bytes;
      } else {
        campos[parte.fieldname] = parte.value;
      }
    }
  } catch (e) {
    if (e instanceof BadRequestException) throw e;
    const code = (e as { code?: string }).code;
    if (code === 'FST_REQ_FILE_TOO_LARGE') {
      throw new PayloadTooLargeException({ code: 'FILE_TOO_LARGE', message: 'A foto passou de 5 MB.' });
    }
    if (code === 'FST_FILES_LIMIT') throw invalido('Envie uma foto só.');
    throw invalido('Não foi possível ler o formulário enviado.');
  }

  if (!foto) {
    throw new BadRequestException({ code: 'FILE_REQUIRED', message: 'A foto da fachada é obrigatória (campo `photo`).' });
  }
  if (typeof campos.new_place === 'string') {
    try {
      campos.new_place = JSON.parse(campos.new_place);
    } catch {
      throw invalido('new_place: JSON inválido.');
    }
  }
  const dto = plainToInstance(CheckinDto, campos);
  const erros = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  if (erros.length > 0) throw invalido(flattenErrors(erros));
  return { campos: dto, foto };
}
