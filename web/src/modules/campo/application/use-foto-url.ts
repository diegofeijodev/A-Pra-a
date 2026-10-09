'use client';

import { useEffect, useState } from 'react';
import { campoFotoVisita } from '../infrastructure/campo.api';
import { liberarUrlDepois } from '../infrastructure/object-url';
import { useFilaStore } from './use-fila';

/**
 * A foto da visita para mostrar na tela: o arquivo ainda na fila (check-in sem
 * sinal) ou, depois de enviado, o da API. Libera a URL ao sair.
 */
export function useFotoUrl(ref: string): string | null {
  // Depende só de o check-in estar na fila (seq): o `getAll` do IndexedDB clona o Blob a cada
  // recarga da fila, e depender do objeto refaria a URL a cada rascunho salvo.
  const seqNaFila = useFilaStore((s) => {
    const i = s.itens.find((x) => x.kind === 'checkin' && x.payload.client_id === ref);
    return i ? (i.seq ?? -1) : null;
  });
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    let atual: string | null = null;
    const usar = (b: Blob) => {
      if (!vivo) return;
      atual = URL.createObjectURL(b);
      setUrl(atual);
    };
    const item = seqNaFila === null ? undefined : useFilaStore.getState().itens.find((x) => x.kind === 'checkin' && x.payload.client_id === ref);
    const blobLocal = item?.kind === 'checkin' ? item.foto : null;
    if (blobLocal) usar(blobLocal);
    else void campoFotoVisita(ref).then(usar).catch(() => undefined);
    return () => {
      vivo = false;
      // Sem revogar já: o <img> ainda aponta para esta URL até o próximo commit.
      if (atual) liberarUrlDepois(atual);
    };
  }, [ref, seqNaFila]);

  return url;
}
