import type { ValidationError } from 'class-validator';

/**
 * Mensagens do class-validator numa linha só ("campo: problema | ..."). Em
 * payload aninhado as constraints ficam nos FILHOS — ler só o nível de cima
 * devolve mensagem vazia. Usado pelo `ValidationPipe` global e pela validação
 * manual do check-in multipart.
 */
export function flattenErrors(errors: ValidationError[], path = ''): string {
  return errors
    .flatMap((e) => {
      const campo = path ? `${path}.${e.property}` : e.property;
      const proprias = Object.values(e.constraints ?? {}).map((m) => `${campo}: ${m}`);
      const filhas = e.children?.length ? [flattenErrors(e.children, campo)] : [];
      return [...proprias, ...filhas];
    })
    .filter(Boolean)
    .join(' | ');
}
