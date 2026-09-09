// Validação de data "só dia" no wire. Só o formato não basta: "2026-02-31"
// passa em qualquer regex, entra no banco e só explode depois, quando
// `dateFromString` devolve `Invalid Date` e `toISOString()` derruba a
// requisição com 500 (mesma classe de buraco que o `isUuid()` fecha para id
// malformado — ver CLAUDE.md).
import { registerDecorator, ValidationOptions } from 'class-validator';
import { isDateString } from '../time/dates';

/** `true` só para data existente no calendário, no formato "YYYY-MM-DD". */
export const isDayString = (value: unknown): value is string => isDateString(value);

/** Campo de DTO que aceita uma data só-dia — formato **e** existência no calendário. */
export function IsDayString(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isDayString',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate: (value: unknown) => isDayString(value),
        // O `flattenErrors` do main.ts já prefixa o nome do campo.
        defaultMessage: () => 'deve ser uma data válida no formato YYYY-MM-DD',
      },
    });
  };
}
