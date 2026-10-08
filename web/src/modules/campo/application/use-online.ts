'use client';

import { useSyncExternalStore } from 'react';

function assinar(aviso: () => void) {
  window.addEventListener('online', aviso);
  window.addEventListener('offline', aviso);
  return () => {
    window.removeEventListener('online', aviso);
    window.removeEventListener('offline', aviso);
  };
}

/** `navigator.onLine` reativo. */
export const useOnline = (): boolean =>
  useSyncExternalStore(assinar, () => navigator.onLine, () => true);
