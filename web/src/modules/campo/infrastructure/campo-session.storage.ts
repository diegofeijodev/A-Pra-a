// Sessão do CONSULTOR de campo: chave própria (`campoSession`), separada da
// sessão da equipe (`authUser`, em `auth/infrastructure/auth.storage.ts`). É o
// segundo e último arquivo autorizado a tocar o storage (eslint.config.mjs).
// Também guarda os "retratos" (`campoSnapshot:*`) que deixam a tela abrir sem sinal.
import type { CampoSession } from '../domain/campo.types';

const CHAVE = 'campoSession';
const RETRATO = 'campoSnapshot:';
const ULTIMO = 'campoUltimoConsultor';

function ler<T>(chave: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(chave);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function remover(chave: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(chave);
  } catch {
    // Storage bloqueado: nada a remover.
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
  remover(CHAVE);
}

export function getSnapshot<T>(nome: string): T | null {
  return ler<T>(RETRATO + nome);
}

export function setSnapshot(nome: string, valor: unknown): void {
  gravar(RETRATO + nome, valor);
}

export function removeSnapshot(nome: string): void {
  remover(RETRATO + nome);
}

export function clearSnapshots(): void {
  if (typeof window === 'undefined') return;
  try {
    for (const k of Object.keys(window.localStorage)) {
      if (k.startsWith(RETRATO)) window.localStorage.removeItem(k);
    }
  } catch {
    // Storage bloqueado: nada a limpar.
  }
}

/**
 * Registra quem entrou por último neste aparelho. Se for OUTRO consultor, os
 * retratos do anterior (hoje, /me) saem — senão a tela de hoje mostraria os
 * dados dele. A fila (IndexedDB) não precisa: já é por `consultant_id`.
 * Devolve `true` quando houve troca.
 */
export function registrarConsultor(id: string): boolean {
  const anterior = ler<string>(ULTIMO);
  gravar(ULTIMO, id);
  if (anterior && anterior !== id) {
    clearSnapshots();
    return true;
  }
  return false;
}

/** Preferência do aparelho: modo "Sol" (borda de 2 px para ler ao sol). Sem armazenamento, vale desligado. */
const SOL = 'campoSol';

export function getPreferenciaSol(): boolean {
  return ler<boolean>(SOL) === true;
}

export function setPreferenciaSol(ligado: boolean): void {
  gravar(SOL, ligado);
}
