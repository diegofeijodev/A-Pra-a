import { paginaInicial } from '@/modules/acesso/domain/acesso';
import { ROTA_CAMPO } from '@/modules/acesso/domain/enderecos';

/**
 * Entrada única (redesenho de 26/10, E3; arquitetura §3.2): um formulário só para as duas contas. Tenta a EQUIPE; só num 401 tenta o
 * CONSULTOR; 429, rede ou 5xx da equipe param ali. A mensagem nunca diz se o e-mail existe: as duas APIs respondem igual a e-mail
 * inexistente e a senha errada, e "Conta desativada" só sai depois de a senha bater.
 */

/** O resultado de uma tentativa, já sem o axios. `status: null` = sem resposta do servidor (rede). */
export type Tentativa =
  | { ok: true }
  | { ok: false; status: number | null; code: string | null; message: string | null };

export type Decisao = { entra: 'equipe' } | { entra: 'campo' } | { tentarCampo: true } | { erro: string };

export const MENSAGEM_ENTRADA = {
  credenciais: 'E-mail ou senha incorretos. Confira e tente de novo.',
  limite: 'Muitas tentativas. Espere um minuto e tente de novo.',
  rede: 'Não conseguimos falar com o servidor. Verifique a internet e tente de novo.',
  generica: 'Não foi possível entrar.',
  falarComAdmin: 'Fale com o administrador.',
} as const;

type Falha = Extract<Tentativa, { ok: false }>;

const ehDesativada = (t: Falha) => t.status === 401 && t.code === 'UNAUTHORIZED';

/** A mensagem da API ("Conta desativada") + o que fazer. */
const mensagemDesativada = (t: Falha) =>
  `${(t.message?.trim() || 'Conta desativada').replace(/[.!]+$/, '')}. ${MENSAGEM_ENTRADA.falarComAdmin}`;

function erroDe(t: Falha): string {
  if (t.status === null) return MENSAGEM_ENTRADA.rede;
  if (t.status === 429) return MENSAGEM_ENTRADA.limite;
  return t.message?.trim() || MENSAGEM_ENTRADA.generica;
}

/**
 * A tabela do §3.2, linha a linha. Chamada duas vezes: só com a resposta da equipe (pode pedir para tentar o campo) e, depois, com as
 * duas.
 */
export function decidirEntrada(equipe: Tentativa, campo?: Tentativa): Decisao {
  if (equipe.ok) return { entra: 'equipe' };
  // 429, rede, 5xx ou qualquer outra recusa da equipe: para aqui, sem gastar uma tentativa no campo.
  if (equipe.status !== 401) return { erro: erroDe(equipe) };
  if (!campo) return { tentarCampo: true };
  if (campo.ok) return { entra: 'campo' };
  if (campo.status !== 401) return { erro: erroDe(campo) };
  // Os dois recusaram: "desativada" (senha certa numa das contas) vence "e-mail ou senha".
  const desativada = [equipe, campo].find(ehDesativada);
  return { erro: desativada ? mensagemDesativada(desativada) : MENSAGEM_ENTRADA.credenciais };
}

/** Para onde vai o consultor depois de entrar: a troca obrigatória da senha provisória, ou o dia dele. */
export const destinoDoCampo = (mustChangePassword: boolean): string => (mustChangePassword ? ROTA_CAMPO.senha : ROTA_CAMPO.inicio);

export interface Sessoes {
  equipe: boolean;
  campo: { must_change_password: boolean } | null;
}

/**
 * Quem já tem sessão não vê a entrada (arquitetura §3.3). A equipe vence: num aparelho com as duas sessões (estado de antes da entrada
 * única), a raiz e a entrada levam à equipe — e nada é apagado aqui (apagar derrubaria um consultor sem aviso). `null` = sem sessão.
 */
export function destinoDaSessao(s: Sessoes): string | null {
  if (s.equipe) return paginaInicial();
  if (s.campo) return destinoDoCampo(s.campo.must_change_password);
  return null;
}
