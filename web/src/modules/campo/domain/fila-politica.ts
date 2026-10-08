import type { AcaoFila, ItemFila } from './campo.types';

export type Desfecho = 'ok' | 'rede' | 'sessao' | 'regra';

/**
 * O que a fila faz com a resposta de um envio (spec §9):
 * - `rede` (sem resposta, 408, 429, 5xx): guarda e tenta de novo com espera crescente;
 * - `sessao` (401, senha provisória pendente): pausa SEM apagar — sai depois do login;
 * - `regra` (400/403/404/409/413/422): não repete — tira da fila e mostra a mensagem da API.
 */
export function classificar(status: number | undefined, code?: string): Desfecho {
  if (status === undefined || status === 0) return 'rede';
  if (status >= 200 && status < 300) return 'ok';
  if (status === 401) return 'sessao';
  if (status === 403 && code === 'PASSWORD_CHANGE_REQUIRED') return 'sessao';
  if (status === 408 || status === 429 || status >= 500) return 'rede';
  return 'regra';
}

export const ESPERA_INICIAL_MS = 2_000;
export const ESPERA_MAXIMA_MS = 5 * 60_000;

/** Próxima tentativa: 2 s, 4 s, 8 s… até 5 min. */
export function proximaTentativa(tentativas: number, agora: number): number {
  return agora + Math.min(ESPERA_INICIAL_MS * 2 ** tentativas, ESPERA_MAXIMA_MS);
}

/**
 * Rascunho novo da mesma visita substitui o anterior ainda na fila: o corpo é o
 * questionário INTEIRO, então só o último importa (sem isso, uma tarde sem sinal
 * enfileiraria um envio por toque).
 */
export function substituidos(fila: ItemFila[], nova: AcaoFila): number[] {
  if (nova.kind !== 'answers') return [];
  return fila
    .filter((i) => i.kind === 'answers' && i.visit_ref === nova.visit_ref && i.seq !== undefined)
    .map((i) => i.seq as number);
}

/** Ponto de trilha com precisão pior que 100 m é descartado (spec §7). */
export const PRECISAO_MAXIMA_TRILHA_M = 100;
export const pontoDeTrilhaUtil = (accuracy: number): boolean => accuracy <= PRECISAO_MAXIMA_TRILHA_M;

/**
 * Rascunho novo de uma visita: o checkout dela ainda na fila (bloqueado ou não)
 * tem de ir DEPOIS dele — o checkout nunca passa na frente do último rascunho.
 */
export function checkoutsParaReposicionar(fila: ItemFila[], nova: AcaoFila): ItemFila[] {
  if (nova.kind !== 'answers') return [];
  return fila.filter((i) => i.kind === 'checkout' && i.visit_ref === nova.visit_ref && i.seq !== undefined);
}

/** Nome para avisar o consultor: check-in ainda na fila, senão o retrato do /today, senão "visita". */
export function nomeDaVisita(ref: string, fila: ItemFila[], visitasDoServidor: { client_id: string; lead_name: string }[]): string {
  for (const i of fila) if (i.kind === 'checkin' && i.payload.client_id === ref) return i.payload.place_name;
  return visitasDoServidor.find((v) => v.client_id === ref)?.lead_name ?? 'visita';
}
