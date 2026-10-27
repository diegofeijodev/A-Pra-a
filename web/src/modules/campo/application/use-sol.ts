'use client';

import { useEffect } from 'react';
import { create } from 'zustand';
import { getPreferenciaSol, setPreferenciaSol } from '../infrastructure/campo-session.storage';

interface SolState {
  sol: boolean;
  lido: boolean;
  ler: () => void;
  alternar: () => void;
}

/**
 * Uma preferência só para o aparelho inteiro: o interruptor mora na faixa do topo (redesenho E5c, UX §2.5) e o `data-sol` na
 * raiz da casca — os dois precisam ver o mesmo valor (com `useState` em cada um, cada chamada tinha o seu).
 */
const useSolStore = create<SolState>((set, get) => ({
  sol: false,
  lido: false,
  ler: () => {
    if (!get().lido) set({ sol: getPreferenciaSol(), lido: true });
  },
  alternar: () => {
    const novo = !get().sol;
    setPreferenciaSol(novo);
    set({ sol: novo, lido: true });
  },
}));

/** Modo "Sol": borda de 2 px para ler ao sol. Preferência do aparelho (storage pode falhar: aí vale desligado). */
export function useSol(): { sol: boolean; alternar: () => void } {
  const sol = useSolStore((s) => s.sol);
  const alternar = useSolStore((s) => s.alternar);
  const ler = useSolStore((s) => s.ler);
  // Lê o aparelho depois de montar (no servidor não há storage): a primeira pintura é sempre a sem Sol, como antes.
  useEffect(() => {
    ler();
  }, [ler]);
  return { sol, alternar };
}
