import { describe, expect, it } from 'vitest';
import { paginaInicial } from '@/modules/acesso/domain/acesso';
import { decidirEntrada, destinoDaSessao, destinoDoCampo, MENSAGEM_ENTRADA, type Tentativa } from '../entrada';

const OK: Tentativa = { ok: true };
const falha = (status: number | null, code: string | null = null, message: string | null = null): Tentativa => ({ ok: false, status, code, message });
const CREDENCIAIS = falha(401, 'INVALID_CREDENTIALS', 'E-mail ou senha inválidos');
const DESATIVADA = falha(401, 'UNAUTHORIZED', 'Conta desativada');
const LIMITE = falha(429, 'TOO_MANY_REQUESTS', 'ThrottlerException: Too Many Requests');
const REDE = falha(null);
const SERVIDOR = falha(500, 'INTERNAL_ERROR', 'Erro interno');

describe('decidirEntrada: a tabela da arquitetura §3.2, linha a linha', () => {
  it('equipe 200 → entra na equipe (o campo nem é tentado)', () => {
    expect(decidirEntrada(OK)).toEqual({ entra: 'equipe' });
  });

  it('equipe 401 (qualquer código) → tenta o campo', () => {
    expect(decidirEntrada(CREDENCIAIS)).toEqual({ tentarCampo: true });
    expect(decidirEntrada(DESATIVADA)).toEqual({ tentarCampo: true });
    expect(decidirEntrada(falha(401))).toEqual({ tentarCampo: true });
  });

  it('equipe 401 + campo 200 → entra no campo (mesmo com a conta da equipe desativada)', () => {
    expect(decidirEntrada(CREDENCIAIS, OK)).toEqual({ entra: 'campo' });
    expect(decidirEntrada(DESATIVADA, OK)).toEqual({ entra: 'campo' });
  });

  it('as duas com e-mail ou senha errados → uma mensagem só, sem dizer se o e-mail existe', () => {
    const d = decidirEntrada(CREDENCIAIS, CREDENCIAIS);
    expect(d).toEqual({ erro: MENSAGEM_ENTRADA.credenciais });
    expect(MENSAGEM_ENTRADA.credenciais).not.toMatch(/não encontrad|não existe|cadastrad/i);
  });

  it('equipe desativada + campo errado → "Conta desativada" da API + "Fale com o administrador."', () => {
    expect(decidirEntrada(DESATIVADA, CREDENCIAIS)).toEqual({ erro: 'Conta desativada. Fale com o administrador.' });
  });

  it('equipe errada + campo desativado → idem', () => {
    expect(decidirEntrada(CREDENCIAIS, DESATIVADA)).toEqual({ erro: 'Conta desativada. Fale com o administrador.' });
    // O texto vem da API; sem ele, o padrão.
    expect(decidirEntrada(CREDENCIAIS, falha(401, 'UNAUTHORIZED'))).toEqual({ erro: 'Conta desativada. Fale com o administrador.' });
  });

  it('equipe 429 → para SEM tentar o campo: "Muitas tentativas"', () => {
    expect(decidirEntrada(LIMITE)).toEqual({ erro: MENSAGEM_ENTRADA.limite });
    // Mesmo que alguém passe a resposta do campo, ela não muda a decisão.
    expect(decidirEntrada(LIMITE, OK)).toEqual({ erro: MENSAGEM_ENTRADA.limite });
  });

  it('equipe 401 + campo 429 → "Muitas tentativas"', () => {
    expect(decidirEntrada(CREDENCIAIS, LIMITE)).toEqual({ erro: MENSAGEM_ENTRADA.limite });
  });

  it('rede ou 5xx da equipe → para sem tentar o campo, com a mensagem de rede ou a do servidor', () => {
    expect(decidirEntrada(REDE)).toEqual({ erro: MENSAGEM_ENTRADA.rede });
    expect(decidirEntrada(SERVIDOR)).toEqual({ erro: 'Erro interno' });
    expect(decidirEntrada(falha(502))).toEqual({ erro: MENSAGEM_ENTRADA.generica });
  });

  it('equipe 401 + campo sem rede ou 5xx → a mensagem desse erro', () => {
    expect(decidirEntrada(CREDENCIAIS, REDE)).toEqual({ erro: MENSAGEM_ENTRADA.rede });
    expect(decidirEntrada(CREDENCIAIS, SERVIDOR)).toEqual({ erro: 'Erro interno' });
  });

  it('400 de validação da equipe (senha com mais de 72) → a mensagem do servidor, sem tentar o campo', () => {
    expect(decidirEntrada(falha(400, 'VALIDATION_ERROR', 'password must be shorter than or equal to 72 characters'))).toEqual({
      erro: 'password must be shorter than or equal to 72 characters',
    });
  });
});

describe('destinoDaSessao: quem já tem sessão não vê a entrada', () => {
  it('as 4 combinações: a equipe vence; só o campo vai ao campo; nenhuma fica na entrada', () => {
    const campo = { must_change_password: false };
    expect(destinoDaSessao({ equipe: true, campo: null })).toBe(paginaInicial());
    expect(destinoDaSessao({ equipe: true, campo })).toBe(paginaInicial());
    expect(destinoDaSessao({ equipe: false, campo })).toBe('/campo');
    expect(destinoDaSessao({ equipe: false, campo: null })).toBeNull();
  });

  it('consultor com a senha provisória pendente vai à troca, dentro de /campo (escopo do atalho)', () => {
    expect(destinoDaSessao({ equipe: false, campo: { must_change_password: true } })).toBe('/campo/senha');
    expect(destinoDaSessao({ equipe: true, campo: { must_change_password: true } })).toBe(paginaInicial());
    expect(destinoDoCampo(true)).toBe('/campo/senha');
    expect(destinoDoCampo(false)).toBe('/campo');
  });
});
