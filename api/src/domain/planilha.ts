// Leitura de células da planilha de estabelecimentos (bloco B, §21.3).

/** CNAE em 7 dígitos (`5611-2/01` → `5611201`); qualquer outra coisa vira `null`. */
export function normalizarCnae(v: unknown): string | null {
  if (v == null) return null;
  const d = String(v).replace(/\D/g, '');
  return d.length === 7 ? d : null;
}

/** Latitude/longitude de planilha: aceita vírgula decimal; fora de faixa vira `null`. */
export function lerCoordenada(v: unknown, limite: 90 | 180): number | null {
  if (v == null) return null;
  const s = String(v).trim().replace(',', '.');
  if (!s || !/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) && Math.abs(n) <= limite && n !== 0 ? n : null;
}
