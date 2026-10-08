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

export type ItemNovo = Omit<ItemFila, 'seq'>;

/**
 * Rascunho novo (`answers`) de uma visita. Decide, sobre a fila do consultor:
 * - o rascunho antigo e não enviado da mesma visita é substituído;
 * - o checkout dela (bloqueado ou não) vai para DEPOIS do rascunho novo (e perde o bloqueio);
 * - tudo o que estava depois do checkout volta na MESMA ordem, atrás dele — senão
 *   o check-in da visita seguinte passaria na frente do checkout desta (409).
 * Sem checkout na fila, só troca o rascunho antigo. `remover` = seqs; `adicionar` = nova ordem.
 */
export function planejarRascunho(
  filaDoConsultor: ItemFila[],
  nova: AcaoFila,
  info: Pick<ItemFila, 'consultant_id' | 'tentativas' | 'proxima_em' | 'criado_em'>,
): { remover: number[]; adicionar: ItemNovo[] } {
  const fila = [...filaDoConsultor].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
  const velhos = new Set(substituidos(fila, nova));
  const novoItem = { ...nova, ...info } as ItemNovo;
  const iCheckout = fila.findIndex((i) => i.kind === 'checkout' && nova.kind === 'answers' && i.visit_ref === nova.visit_ref);
  if (iCheckout < 0) return { remover: [...velhos], adicionar: [novoItem] };

  const cauda = fila.slice(iCheckout);
  const remover = new Set<number>([...velhos, ...cauda.map((i) => i.seq as number)]);
  const semSeq = (i: ItemFila): ItemNovo => {
    const c = { ...i } as ItemFila;
    delete c.seq;
    delete c.bloqueio;
    return c;
  };
  const checkout = semSeq({ ...fila[iCheckout], tentativas: 0, proxima_em: 0 });
  const resto = cauda.slice(1).filter((i) => !velhos.has(i.seq as number)).map(semSeq);
  return { remover: [...remover], adicionar: [novoItem, checkout, ...resto] };
}

/** Nome para avisar o consultor: check-in ainda na fila, senão o retrato do /today, senão "visita". */
export function nomeDaVisita(ref: string, fila: ItemFila[], visitasDoServidor: { client_id: string; lead_name: string }[]): string {
  for (const i of fila) if (i.kind === 'checkin' && i.payload.client_id === ref) return i.payload.place_name;
  return visitasDoServidor.find((v) => v.client_id === ref)?.lead_name ?? 'visita';
}
