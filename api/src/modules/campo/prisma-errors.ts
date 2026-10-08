import { Prisma } from '@prisma/client';

/** Violação de índice único (inclui os índices parciais de "uma aberta por vez"). */
export const violouUnico = (e: unknown): boolean =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
