/**
 * Consultor em várias praças (contrato §44.7). "Consultores desta praça" nas telas da equipe: com a flag o servidor manda o
 * conjunto (`praca_ids`); sem ele (flag desligada ou servidor antigo), a principal, como hoje.
 */
export const atuaNaPraca = (c: { praca_id: string; praca_ids?: string[] }, pracaId: string | undefined | null): boolean =>
  !!pracaId && (c.praca_ids ? c.praca_ids.includes(pracaId) : c.praca_id === pracaId);
