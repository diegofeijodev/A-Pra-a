export const digits = (s: string | null | undefined): string => (s ?? '').replace(/\D/g, '');

/** Chave de comparação: últimos 9 dígitos (igual ao protótipo). */
export const phoneKey = (p: string | null | undefined): string => digits(p).slice(-9);

/** +55DDDNÚMERO. null se não parecer telefone brasileiro (10 ou 11 dígitos nacionais). */
export function toE164BR(p: string | null | undefined): string | null {
  let d = digits(p);
  if (d.startsWith('55') && d.length >= 12) d = d.slice(2);
  if (d.length === 10 || d.length === 11) return `+55${d}`;
  return null;
}
