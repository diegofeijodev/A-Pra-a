// Sessão do CONSULTOR de campo: chave própria (`campoSession`), separada da
// sessão da equipe (`authUser`, em `auth/infrastructure/auth.storage.ts`). É o
// segundo e último arquivo autorizado a tocar o storage (eslint.config.mjs).
// Também guarda os "retratos" (`campoSnapshot:*`) que deixam a tela abrir sem sinal.
import type { CampoSession } from '../domain/campo.types';

const CHAVE = 'campoSession';
const RETRATO = 'campoSnapshot:';

function ler<T>(chave: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(chave);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function gravar(chave: string, valor: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(chave, JSON.stringify(valor));
  } catch {
    // Storage cheio ou bloqueado: a tela segue, só sem o retrato.
  }
}

export function getCampoSession(): CampoSession | null {
  return ler<CampoSession>(CHAVE);
}

export function storeCampoSession(sessao: CampoSession): void {
  gravar(CHAVE, sessao);
}

/** Só a sessão: a fila (IndexedDB) fica guardada até o próximo login (spec §9). */
export function clearCampoSession(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(CHAVE);
}

export function getSnapshot<T>(nome: string): T | null {
  return ler<T>(RETRATO + nome);
}

export function setSnapshot(nome: string, valor: unknown): void {
  gravar(RETRATO + nome, valor);
}

export function removeSnapshot(nome: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(RETRATO + nome);
}

export function clearSnapshots(): void {
  if (typeof window === 'undefined') return;
  for (const k of Object.keys(window.localStorage)) {
    if (k.startsWith(RETRATO)) window.localStorage.removeItem(k);
  }
}
