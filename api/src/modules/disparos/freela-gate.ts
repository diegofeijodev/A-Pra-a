/**
 * Porteira do modo `freela` — ponto único que a Task 15 troca.
 *
 * Hoje devolve sempre `false`: enquanto a integração não existe, criar disparo
 * no modo `freela` responde `503 FREELA_NOT_CONFIGURED` em vez de montar uma
 * fila que ninguém vai enviar (no modo `freela` quem envia é a campanha do
 * Freela, não o operador). Na Task 15 o corpo desta função vira
 * `FreelaClient.isConfigured()` e mais nada muda no serviço.
 */
export const isFreelaConfigured = (): boolean => false;

/** Mesma frase do resto do sistema para conexão com o Freela ausente. */
export const FREELA_NOT_CONFIGURED_MESSAGE =
  'Conexão com o Freela não configurada (FREELA_API_URL, FREELA_ADMIN_EMAIL, FREELA_ADMIN_PASSWORD).';
