/** Foto da fachada (spec §7/§10): o aparelho reduz antes de mandar; a API confere os bytes. */
export const LADO_MAXIMO_PX = 1600;
export const QUALIDADE_JPEG = 0.75;
/** Mesmo teto de multipart da API (`main.ts`). */
export const TETO_FOTO_BYTES = 5 * 1024 * 1024;
export const TIPOS_ACEITOS = ['image/jpeg', 'image/png', 'image/webp'];

export function dimensoesReduzidas(w: number, h: number): { largura: number; altura: number } {
  const maior = Math.max(w, h);
  if (maior <= LADO_MAXIMO_PX) return { largura: w, altura: h };
  const f = LADO_MAXIMO_PX / maior;
  return { largura: Math.round(w * f), altura: Math.round(h * f) };
}

export type EscolhaFoto = { usar: 'reduzida' | 'original' } | { erro: string };

/**
 * Qual arquivo vai para a fila. A reduzida (JPEG ≤ 1600 px) sempre que o
 * navegador conseguiu decodificar; senão o original, só se a API aceitar como
 * está (JPEG/PNG/WEBP ≤ 5 MB) — HEIC do iPhone que o navegador não abre volta
 * com explicação, em vez de virar `400 INVALID_FILE_TYPE` lá na frente, já
 * dentro da fila.
 */
export function escolherEnvio(original: { tipo: string; bytes: number }, reduzida: { bytes: number } | null): EscolhaFoto {
  if (reduzida && reduzida.bytes > 0 && reduzida.bytes <= TETO_FOTO_BYTES) return { usar: 'reduzida' };
  if (TIPOS_ACEITOS.includes(original.tipo) && original.bytes > 0 && original.bytes <= TETO_FOTO_BYTES) return { usar: 'original' };
  return { erro: 'Não foi possível usar esta foto. Tire de novo pela câmera do Praça ou escolha outra imagem (JPEG, PNG ou WEBP).' };
}
