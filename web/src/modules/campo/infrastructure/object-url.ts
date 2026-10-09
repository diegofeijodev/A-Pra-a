/**
 * Libera uma object URL DEPOIS de a tela largar o `<img>` que a usa. Revogar no cleanup do
 * efeito é cedo demais: o DOM ainda aponta para a URL até o próximo commit, e o navegador pode
 * (re)buscá-la -> `net::ERR_FILE_NOT_FOUND` e foto quebrada. O atraso cobre troca de estado,
 * troca de visão e desmontagem; a memória volta logo em seguida.
 */
export const ATRASO_REVOGAR_MS = 10_000;

export function liberarUrlDepois(url: string): void {
  window.setTimeout(() => URL.revokeObjectURL(url), ATRASO_REVOGAR_MS);
}
