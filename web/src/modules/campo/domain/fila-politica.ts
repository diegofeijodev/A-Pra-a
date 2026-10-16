import { daySp } from '@/lib/dates';
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
 * - o checkout dela (bloqueado ou não) vai para DEPOIS do rascunho novo; só perde o bloqueio se o rascunho estiver COMPLETO;
 * - tudo o que estava depois do checkout volta na MESMA ordem, atrás dele — senão
 *   o check-in da visita seguinte passaria na frente do checkout desta (409).
 * Sem checkout na fila, só troca o rascunho antigo. `remover` = seqs; `adicionar` = nova ordem.
 */
export function planejarRascunho(
  filaDoConsultor: ItemFila[],
  nova: AcaoFila,
  info: Pick<ItemFila, 'consultant_id' | 'tentativas' | 'proxima_em' | 'criado_em'>,
  completo: boolean,
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
  const bloqueioAnterior = fila[iCheckout].bloqueio;
  const checkout = semSeq({ ...fila[iCheckout], tentativas: 0, proxima_em: 0 });
  // Rascunho incompleto não destrava: o checkout segue parado (a tela continua mostrando o que falta).
  if (!completo && bloqueioAnterior) checkout.bloqueio = bloqueioAnterior;
  const resto = cauda.slice(1).filter((i) => !velhos.has(i.seq as number));
  // Vaga e voucher da MESMA visita guardados depois de um checkout recusado vão para antes dele:
  // são justamente o que faltava (§21.6).
  const daVisita = (i: ItemFila) => (i.kind === 'vaga' || i.kind === 'voucher') && nova.kind === 'answers' && i.visit_ref === nova.visit_ref;
  return {
    remover: [...remover],
    adicionar: [novoItem, ...resto.filter(daVisita).map(semSeq), checkout, ...resto.filter((i) => !daVisita(i)).map(semSeq)],
  };
}

/** Nome para avisar o consultor: check-in ainda na fila, senão o retrato do /today, senão "visita". */
export function nomeDaVisita(ref: string, fila: ItemFila[], visitasDoServidor: { client_id: string; lead_name: string }[]): string {
  for (const i of fila) if (i.kind === 'checkin' && i.payload.client_id === ref) return i.payload.place_name;
  return visitasDoServidor.find((v) => v.client_id === ref)?.lead_name ?? 'visita';
}

/** O consultor tem `checkin` ou `end` na fila DEPOIS deste checkout? Descartá-lo pode fazer o servidor recusar esses envios. */
export function temEnvioDepoisDoCheckout(fila: ItemFila[], checkoutSeq: number): boolean {
  return fila.some((i) => (i.seq ?? 0) > checkoutSeq && (i.kind === 'checkin' || i.kind === 'end'));
}

/**
 * A conferência de "parecidos" falhou de um jeito que não impede o check-in: sem resposta/timeout
 * (rede) ou `409 NO_OPEN_JOURNEY` (o início da jornada ainda está na fila). O check-in segue sem
 * `confirm_new` e o servidor marca `possible_dup` (decisão 2).
 */
export function seguirSemConferirParecidos(status: number | undefined, code?: string): boolean {
  if (status === 409 && code === 'NO_OPEN_JOURNEY') return true;
  return classificar(status, code) === 'rede';
}

/** Texto de guia quando ainda há envio guardado no celular (a meia-noite fecha a jornada no servidor). */
export const AVISO_ENVIOS_GUARDADOS =
  'Ainda há envios guardados no celular. Mantenha o Praça Campo aberto com sinal até a faixa sumir — o que não for enviado até a meia-noite pode ser perdido.';

/** Hora real da ação (`at`); respostas não têm, então vale a hora em que foram guardadas. */
function instanteDoItem(i: ItemFila): number {
  if (i.kind === 'points') {
    const at = i.payload.points[0]?.at;
    return at ? Date.parse(at) : i.criado_em;
  }
  if (i.kind === 'answers' || i.kind === 'vaga' || i.kind === 'voucher') return i.criado_em;
  return Date.parse(i.payload.at);
}

/** Itens cujo dia (Brasília) é anterior a `hoje` ("YYYY-MM-DD"): o servidor já pode ter fechado a jornada deles. */
export function itensDeDiaAnterior(fila: ItemFila[], hoje: string): ItemFila[] {
  return fila.filter((i) => {
    const t = instanteDoItem(i);
    return Number.isFinite(t) && daySp(t) < hoje;
  });
}

/** Falhas de rede seguidas na cabeça a partir das quais o descarte é oferecido. */
export const TENTATIVAS_PARA_DESCARTAR = 8;

/** Cabeça da fila do consultor, se estiver parada (≥ 8 falhas de rede). Checkout bloqueado tem o próprio descarte. */
export function cabecaParada(fila: ItemFila[], consultantId: string): ItemFila | null {
  const cabeca = [...fila].filter((i) => i.consultant_id === consultantId).sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))[0];
  if (!cabeca || cabeca.tentativas < TENTATIVAS_PARA_DESCARTAR) return null;
  if (cabeca.kind === 'checkout' && cabeca.bloqueio) return null;
  return cabeca;
}

/** Seqs a remover ao descartar `item`: check-in leva as respostas e o checkout da MESMA visita (mesma regra do check-in recusado); o resto, só ele. */
export function seqsParaDescartar(fila: ItemFila[], item: ItemFila): number[] {
  const seqs = [item.seq as number];
  if (item.kind === 'checkin') {
    const ref = item.payload.client_id;
    for (const d of fila) {
      if (d.consultant_id === item.consultant_id && 'visit_ref' in d && d.visit_ref === ref) seqs.push(d.seq as number);
    }
  }
  return seqs;
}
