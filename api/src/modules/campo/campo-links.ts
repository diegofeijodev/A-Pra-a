/**
 * Link de cadastro do Freela com o código do consultor (spec §7, "Link do QR").
 * O cadastro do Freela web já lê `?consultor=`. Lê `process.env` direto pelo
 * mesmo motivo do `FreelaClient`: o boot já validou, e o teste mexe só no ambiente.
 */
export function signupUrl(code: string | null): string | null {
  const base = (process.env.FREELA_WEB_URL ?? '').trim().replace(/\/+$/, '');
  return base && code ? `${base}/cadastro?consultor=${encodeURIComponent(code)}` : null;
}
