// ÚNICO arquivo autorizado a guardar a sessão (convenção do freela-web-v2).
// Chave `authUser`, como nos outros projetos do workspace.
import type { AuthSession } from '../domain/auth.types';

const STORAGE_KEY = 'authUser';

export function getStoredAuth(): AuthSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuthSession) : null;
  } catch {
    return null;
  }
}

export function storeAuth(session: AuthSession): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearStoredAuth(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STORAGE_KEY);
}
