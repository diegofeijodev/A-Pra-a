'use client';

import { create } from 'zustand';
import type { CampoConsultantMe, CampoSession } from '../domain/campo.types';
import { campoLogin, campoTrocarSenha } from '../infrastructure/campo.api';
import {
  clearCampoSession,
  clearSnapshots,
  getCampoSession,
  storeCampoSession,
} from '../infrastructure/campo-session.storage';

interface CampoSessionState {
  session: CampoSession | null;
  hydrated: boolean;
  hydrate: () => void;
  signIn: (email: string, password: string) => Promise<CampoSession>;
  trocarSenha: (atual: string, nova: string) => Promise<CampoSession>;
  /** Dados novos do servidor (`/me`) sem trocar o token. */
  setConsultant: (consultant: CampoConsultantMe) => void;
  /** "Sair": some a sessão e os retratos; a fila fica (é do consultor, sai no próximo login dele). */
  signOut: () => void;
}

export const useCampoSession = create<CampoSessionState>((set, get) => ({
  session: null,
  hydrated: false,
  hydrate: () => set({ session: getCampoSession(), hydrated: true }),
  signIn: async (email, password) => {
    const r = await campoLogin(email, password);
    const session: CampoSession = { access_token: r.access_token, consultant: r.consultant };
    storeCampoSession(session);
    set({ session, hydrated: true });
    return session;
  },
  trocarSenha: async (atual, nova) => {
    const r = await campoTrocarSenha(atual, nova);
    const session: CampoSession = { access_token: r.access_token, consultant: r.consultant };
    storeCampoSession(session);
    set({ session, hydrated: true });
    return session;
  },
  setConsultant: (consultant) => {
    const atual = get().session;
    if (!atual) return;
    const session = { ...atual, consultant };
    storeCampoSession(session);
    set({ session });
  },
  signOut: () => {
    clearCampoSession();
    clearSnapshots();
    set({ session: null, hydrated: true });
  },
}));
