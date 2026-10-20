'use client';

import { useCallback, useEffect, useState } from 'react';

const CHAVE = 'praca-campo-sol';

/** Modo "Sol": borda de 2 px para ler ao sol. Preferência do aparelho (localStorage pode falhar: aí vale desligado). */
export function useSol(): { sol: boolean; alternar: () => void } {
  const [sol, setSol] = useState(false);
  useEffect(() => {
    try {
      setSol(window.localStorage.getItem(CHAVE) === '1');
    } catch {
      // armazenamento bloqueado: segue desligado
    }
  }, []);
  const alternar = useCallback(() => {
    setSol((atual) => {
      const novo = !atual;
      try {
        window.localStorage.setItem(CHAVE, novo ? '1' : '0');
      } catch {
        // sem armazenamento: vale só nesta sessão
      }
      return novo;
    });
  }, []);
  return { sol, alternar };
}
