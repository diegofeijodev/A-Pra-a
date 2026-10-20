/**
 * "Marcar como pago" = campos de texto + comprovante opcional (campo `proof`) num multipart (contrato §29.4).
 * Lê TODAS as partes antes de qualquer consulta ao banco e valida os campos com a MESMA regra do `ValidationPipe`
 * global (whitelist + forbidNonWhitelisted). Sem multipart, aceita o JSON simples (útil quando o comprovante é opcional).
 */
import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { FastifyRequest } from 'fastify';
import { flattenErrors } from '../../../common/validation/flatten-errors';
import { PagarDto } from './dto/payouts.dto';

export interface PagarMultipart {
  campos: PagarDto;
  proof: Buffer | null;
}

const invalido = (message: string) => new BadRequestException({ code: 'VALIDATION_ERROR', message });

export async function lerPagarMultipart(req: FastifyRequest): Promise<PagarMultipart> {
  const campos: Record<string, unknown> = {};
  let proof: Buffer | null = null;
  if (req.isMultipart()) {
    try {
      for await (const parte of req.parts()) {
        if (parte.type === 'file') {
          const bytes = await parte.toBuffer();
          if (parte.fieldname !== 'proof') throw invalido(`campo de arquivo inesperado: ${parte.fieldname}`);
          proof = bytes.length ? bytes : null;
        } else {
          campos[parte.fieldname] = parte.value;
        }
      }
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      const code = (e as { code?: string }).code;
      if (code === 'FST_REQ_FILE_TOO_LARGE') {
        throw new PayloadTooLargeException({ code: 'FILE_TOO_LARGE', message: 'O comprovante passou de 5 MB.' });
      }
      if (code === 'FST_FILES_LIMIT') throw invalido('Envie um comprovante só.');
      throw invalido('Não foi possível ler o formulário enviado.');
    }
  } else if (req.body && typeof req.body === 'object') {
    Object.assign(campos, req.body as Record<string, unknown>);
  }
  for (const k of Object.keys(campos)) if (campos[k] === '') delete campos[k];
  const dto = plainToInstance(PagarDto, campos);
  const erros = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  if (erros.length > 0) throw invalido(flattenErrors(erros));
  return { campos: dto, proof };
}
