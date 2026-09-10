// Formatação de números — porte de `.prototype/src/lib/praca/{funil,campanhas,indicadores}.ts`.

/** Valor cheio em reais: "R$ 4.500". */
export const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/** Valor curto para caber em cartão: "R$ 4,5k". */
export const fmtBRL = (v: number) =>
  v >= 1000 ? `R$ ${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k` : `R$ ${v}`;

/**
 * Valor de indicador com a unidade colada — porte de `fmtVal`
 * (`.prototype/src/lib/praca/indicadores.ts:103`). A API devolve o número com a
 * precisão do cálculo (`2.7272727272727275`); o arredondamento é da TELA: uma
 * casa em `%` e `h`, inteiro no resto. `null` (sem base para calcular) vira "—",
 * que não é a mesma coisa que zero.
 */
export function fmtVal(v: number | null | undefined, unit: string): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const n = unit === "%" || unit === "h" ? Math.round(v * 10) / 10 : Math.round(v);
  const num = n.toLocaleString("pt-BR");
  if (unit === "R$") return `R$ ${num}`;
  return unit ? `${num}${unit}` : num;
}
