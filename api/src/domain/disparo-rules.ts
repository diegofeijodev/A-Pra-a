/**
 * Regras puras do disparo em lote — porta de
 * `.prototype/src/components/praca/Disparos.tsx:58-91` (público, bloqueio,
 * trava de 30 dias, variação da prévia) e de
 * `.prototype/src/lib/praca/store.tsx:588-646` (`createCampaign`).
 *
 * Aqui não entra Prisma nem HTTP: o serviço carrega público, lista de bloqueio
 * e envios anteriores do banco e passa como lista/predicado. É o que deixa a
 * divisão A/B e a trava de 30 dias testáveis sem subir a API.
 */

/** Dias que a trava de duplicidade olha para trás. */
export const DUP_WINDOW_DAYS = 30;

/**
 * Instante-limite da trava: envio agendado DEPOIS disto conta como repetido.
 * Igual ao protótipo (`Date.now() - 30 * 86400000`), sem fuso no meio — a
 * comparação é entre instantes, não entre dias civis.
 */
export const dupCutoff = (now: Date = new Date()): Date =>
  new Date(now.getTime() - DUP_WINDOW_DAYS * 86_400_000);

/**
 * Variante deste índice: A/B alternando um a um (índice ímpar = B). Só divide
 * quando o disparo pediu a divisão **e** o modelo tem variante B — modelo sem
 * texto B manda A para todo mundo, mesmo com `split: true`.
 */
export const pickVariant = (index: number, split: boolean, hasB: boolean): 'A' | 'B' =>
  split && hasB && index % 2 === 1 ? 'B' : 'A';

/** O recorte de um envio anterior que a trava de 30 dias enxerga. */
export interface DupSend {
  template_id: string | null;
  scheduled_at: Date | string;
}

/**
 * Este envio anterior tranca o modelo para o lead? Mesmo modelo e agendado
 * dentro da janela — qualquer status, inclusive `fila`: o que a trava evita é
 * montar a mesma mensagem duas vezes, não reenviar o que já saiu.
 */
export const isDupSend = (send: DupSend, templateId: string, cutoff: Date): boolean =>
  send.template_id === templateId && new Date(send.scheduled_at).getTime() > cutoff.getTime();

export interface Partition<T> {
  /** Quem recebe, na ordem em que entrou — é a ordem que decide a variante. */
  sendable: T[];
  blocked: number;
  dupes: number;
}

/**
 * Quebra o público em quem pode receber, quantos estão na lista de bloqueio e
 * quantos caíram na trava de 30 dias.
 *
 * Bloqueio e trava são contados de forma **independente** (o mesmo lead pode
 * aparecer nos dois números, como no protótipo), mas quem cai em qualquer um
 * dos dois sai do envio — por isso `sendable + blocked + dupes` não fecha
 * necessariamente com o total do público.
 */
export function partitionAudience<T>(
  audience: readonly T[],
  isBlocked: (item: T) => boolean,
  isDup: (item: T) => boolean,
): Partition<T> {
  const out: Partition<T> = { sendable: [], blocked: 0, dupes: 0 };
  for (const item of audience) {
    const bloqueado = isBlocked(item);
    const repetido = isDup(item);
    if (bloqueado) out.blocked++;
    if (repetido) out.dupes++;
    if (!bloqueado && !repetido) out.sendable.push(item);
  }
  return out;
}
