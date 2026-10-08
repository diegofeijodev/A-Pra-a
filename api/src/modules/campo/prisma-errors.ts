import { Prisma } from '@prisma/client';

/** Violação de índice único (inclui os índices parciais de "uma aberta por vez"). */
export const violouUnico = (e: unknown): boolean =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

/** Qual coluna única do consultor estourou (`meta.target` = colunas ou nome do índice). */
export function colunaUnicaDoConsultor(e: unknown): 'email' | 'cpf' | null {
  if (!violouUnico(e)) return null;
  const target = (e as { meta?: { target?: unknown } }).meta?.target;
  const texto = (Array.isArray(target) ? target.join(',') : String(target ?? '')).toLowerCase();
  if (texto.includes('email')) return 'email';
  if (texto.includes('cpf')) return 'cpf';
  return null;
}
