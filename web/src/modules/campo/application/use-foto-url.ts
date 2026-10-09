'use client';

import { useEffect, useState } from 'react';
import { campoFotoVisita } from '../infrastructure/campo.api';
import { useFilaStore } from './use-fila';

/**
 * A foto da visita para mostrar na tela: o arquivo ainda na fila (check-in sem
 * sinal) ou, depois de enviado, o da API. Libera a URL ao sair.
 */
export function useFotoUrl(ref: string): string | null {
  const naFila = useFilaStore((s) =>
    s.itens.find((i) => i.kind === 'checkin' && i.payload.client_id === ref),
  );
  const blobLocal = naFila?.kind === 'checkin' ? naFila.foto : null;
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    let atual: string | null = null;
    const usar = (b: Blob) => {
      if (!vivo) return;
      atual = URL.createObjectURL(b);
      setUrl(atual);
    };
    if (blobLocal) usar(blobLocal);
    else void campoFotoVisita(ref).then(usar).catch(() => vivo && setUrl(null));
    return () => {
      vivo = false;
      if (atual) URL.revokeObjectURL(atual);
    };
  }, [ref, blobLocal]);

  return url;
}
