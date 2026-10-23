/**
 * Consultor em várias praças (contrato §44.5–§44.6, UX §3.8 "Praça no campo"). Regras puras da tela do consultor: quando a
 * escolha aparece, o que vem marcado, o que vai no corpo do início e o nome da praça no cabeçalho. O servidor decide de
 * verdade (o conjunto, o padrão e a praça ativa); aqui é só o que aparece.
 */

export interface PracaDoConjunto {
  id: string;
  name: string;
  principal: boolean;
}

/** O que o `/me` traz para isto (só com a flag; servidor antigo ou flag desligada = nada). */
export interface MePracas {
  features?: { multi_praca?: boolean };
  consultant: { praca_id: string; praca_name: string };
  pracas?: PracaDoConjunto[];
  default_praca_id?: string;
  active_praca_id?: string;
}

/**
 * A escolha "Em qual praça você está hoje?" só aparece com a flag, mais de uma praça no conjunto e SEM roteiro hoje (com
 * roteiro, a praça vem dele: 0 toques).
 */
export function mostraEscolhaDePraca(me: MePracas | undefined, temRoteiroHoje: boolean): boolean {
  return me?.features?.multi_praca === true && (me.pracas?.length ?? 0) > 1 && !temRoteiroHoje;
}

/** A que vem marcada: a escolhida, se ainda estiver no conjunto; senão o padrão do servidor; senão a principal. */
export function pracaMarcada(me: MePracas | undefined, escolhida: string | null): string | null {
  if (!me) return null;
  const ids = (me.pracas ?? []).map((p) => p.id);
  if (escolhida && ids.includes(escolhida)) return escolhida;
  if (me.default_praca_id && ids.includes(me.default_praca_id)) return me.default_praca_id;
  return me.consultant.praca_id;
}

/** O que vai no corpo do `start`: `praca_id` só quando a escolha está na tela (sem ela, o servidor decide; flag desligada nunca manda). */
export function pracaDoCorpo(me: MePracas | undefined, temRoteiroHoje: boolean, escolhida: string | null): { praca_id?: string } {
  if (!mostraEscolhaDePraca(me, temRoteiroHoje)) return {};
  const id = pracaMarcada(me, escolhida);
  return id ? { praca_id: id } : {};
}

/**
 * Nome da praça no cabeçalho: com a flag, a da jornada aberta (servidor ou a da fila) e, sem jornada, a ativa do `/me`;
 * desligada (ou sem o conjunto), a principal, como hoje.
 */
export function nomeDaPracaAtiva(me: MePracas | undefined, pracaDaJornada: string | null | undefined): string {
  if (!me) return '';
  if (me.features?.multi_praca !== true || !me.pracas?.length) return me.consultant.praca_name;
  const id = pracaDaJornada ?? me.active_praca_id ?? me.consultant.praca_id;
  return me.pracas.find((p) => p.id === id)?.name ?? me.consultant.praca_name;
}
