'use client';

import { create } from 'zustand';

/**
 * Estado só de tela, em memória (sem persistência): qual pessoa filtra o Hoje e
 * qual painel está aberto. O que é dado do sistema vive no react-query; o que é
 * "onde o usuário está olhando" vive aqui.
 */
interface UiState {
  /** 'all' ou o id de uma pessoa. */
  hojePerson: 'all' | string;
  openActionId: string | null;
  openLeadId: string | null;
  setHojePerson: (person: 'all' | string) => void;
  openAction: (id: string | null) => void;
  openLead: (id: string | null) => void;
}

export const useUiStore = create<UiState>((set) => ({
  hojePerson: 'all',
  openActionId: null,
  openLeadId: null,
  setHojePerson: (hojePerson) => set({ hojePerson }),
  openAction: (openActionId) => set({ openActionId }),
  openLead: (openLeadId) => set({ openLeadId }),
}));
