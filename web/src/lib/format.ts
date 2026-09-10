// Formatação de números — porte de `.prototype/src/lib/praca/{funil,campanhas}.ts`.

/** Valor cheio em reais: "R$ 4.500". */
export const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/** Valor curto para caber em cartão: "R$ 4,5k". */
export const fmtBRL = (v: number) =>
  v >= 1000 ? `R$ ${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k` : `R$ ${v}`;
