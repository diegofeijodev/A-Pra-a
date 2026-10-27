'use client';

import { useState } from 'react';

/**
 * Contador de remontagem por campo — `id` é a linha (a pessoa, a ação, a praça) e `campo` é o que o `PATCH` mandou. `keyFor`
 * devolve só o prefixo do `key`; o valor do servidor continua colado no fim pela chamadora, que é o que remonta o campo quando a
 * gravação passa. `bump` sobe o contador de um campo só: quando a gravação NÃO passa, a linha do servidor não muda e, sem isto,
 * o valor recusado ficaria na tela como se estivesse gravado. Por campo (e não por bloco) porque a gravação também é por campo:
 * um erro no campo A não pode remontar o campo B e engolir o que ainda está sendo digitado lá.
 */
export function useFieldResync() {
  const [contadores, setContadores] = useState<Record<string, number>>({});
  const keyFor = (id: string, campo: string) => `${campo}-${id}-${contadores[`${id}:${campo}`] ?? 0}`;
  const bump = (id: string, campo: string) =>
    setContadores((atuais) => {
      const chave = `${id}:${campo}`;
      return { ...atuais, [chave]: (atuais[chave] ?? 0) + 1 };
    });
  return { keyFor, bump };
}
