/** Abas da tela Mensagens que a URL (`?aba=`) pode abrir. Sem `?aba=` (ou com valor desconhecido) abre em "modelos". */
export type AbaMensagens = 'modelos' | 'disparos' | 'cadencias';

/**
 * Lê a aba de `?aba=…` (aceita a query com ou sem o "?" na frente).
 * A URL usa `cadencias` sem acento, para o link de Automações não depender de codificação.
 */
export function abaDeMensagens(busca: string | null | undefined): AbaMensagens {
  const aba = new URLSearchParams(busca ?? '').get('aba');
  return aba === 'cadencias' || aba === 'disparos' ? aba : 'modelos';
}
