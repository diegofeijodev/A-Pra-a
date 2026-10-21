'use client';

import { useCallback, useEffect, useState } from 'react';
import { getPreferenciaSol, setPreferenciaSol } from '../infrastructure/campo-session.storage';

/** Modo "Sol": borda de 2 px para ler ao sol. Preferência do aparelho (storage pode falhar: aí vale desligado). */
export function useSol(): { sol: boolean; alternar: () => void } {
  const [sol, setSol] = useState(false);
  useEffect(() => {
    setSol(getPreferenciaSol());
  }, []);
  const alternar = useCallback(() => {
    setSol((atual) => {
      const novo = !atual;
      setPreferenciaSol(novo);
      return novo;
    });
  }, []);
  return { sol, alternar };
}
