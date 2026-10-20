/**
 * Telefone de quem atendeu (contrato §30.3). Espelho de `normalizarTelefoneContato` /
 * `mascararTelefoneContato` da API: só dígitos, 10–11 (DDD + número), tira o 55 inicial.
 * Dado pessoal de terceiro: nunca vai para log nem para mensagem de erro.
 */
export function normalizarTelefone(bruto: string | null | undefined): { ok: true; valor: string | null } | { ok: false } {
  if (bruto == null || bruto.trim() === '') return { ok: true, valor: null };
  let d = bruto.replace(/\D/g, '');
  if (d === '') return { ok: false };
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2);
  if (d.length !== 10 && d.length !== 11) return { ok: false };
  if (Number(d.slice(0, 2)) < 11 || /^(\d)\1+$/.test(d)) return { ok: false };
  return { ok: true, valor: d };
}

/** `11987654321` → `(11) 98765-4321` (para o campo); incompleto devolve o que há. */
export function formatarTelefone(d: string): string {
  const x = d.replace(/\D/g, '').slice(0, 11);
  if (x.length <= 2) return x;
  if (x.length <= 6) return `(${x.slice(0, 2)}) ${x.slice(2)}`;
  const corte = x.length === 11 ? 7 : 6;
  return `(${x.slice(0, 2)}) ${x.slice(2, corte)}${x.length > corte ? `-${x.slice(corte)}` : ''}`;
}

/** `(11) 9****-4321` (11 dígitos) ou `(11) ****-7890` (10). */
export function mascararTelefone(d: string | null | undefined): string | null {
  if (!d) return null;
  const x = d.replace(/\D/g, '');
  if (x.length === 11) return `(${x.slice(0, 2)}) ${x[2]}****-${x.slice(7)}`;
  if (x.length === 10) return `(${x.slice(0, 2)}) ****-${x.slice(6)}`;
  return null;
}
