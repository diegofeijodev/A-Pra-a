'use client';

import { create } from 'zustand';
import type { AuthUser } from '../domain/auth.types';
import { login } from '../infrastructure/auth.api';
import { clearStoredAuth, getStoredAuth, storeAuth } from '../infrastructure/auth.storage';

interface AuthState {
  user: AuthUser | null;
  hydrated: boolean;
  hydrate: () => void;
  signIn: (email: string, password: string) => Promise<AuthUser>;
  setUser: (user: AuthUser) => void;
  signOut: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  hydrated: false,
  hydrate: () => {
    set({ user: getStoredAuth()?.user ?? null, hydrated: true });
  },
  signIn: async (email, password) => {
    const session = await login(email, password);
    storeAuth(session);
    set({ user: session.user, hydrated: true });
    return session.user;
  },
  // O token não muda quando o perfil muda (tema, praça ativa, nome): reescreve
  // só o `user` guardado, mantendo o `access_token` que já estava lá.
  setUser: (user) => {
    const stored = getStoredAuth();
    if (stored) storeAuth({ ...stored, user });
    set({ user });
  },
  signOut: () => {
    clearStoredAuth();
    set({ user: null, hydrated: true });
  },
}));
