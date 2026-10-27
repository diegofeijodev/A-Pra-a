import { describe, expect, it } from 'vitest';
import { ALFABETO_PROVISORIA, gerarSenhaProvisoria, inteiroAleatorio, linkWhatsappAcesso } from '../cadastro';
import { conferirRegras, senhaCumpre, type PoliticaLigada } from '../senha';

/**
 * Gerador da senha provisória da equipe (redesenho E5.8, Usuários; arquitetura §1.1 G7): a mesma regra do servidor
 * (`api/src/domain/senha-rules.ts`, `gerarSenhaProvisoria`): 12 caracteres sem os ambíguos, com maiúscula, minúscula e número
 * — cumpre a regra MAIS FORTE que a configuração permite (§41.2: 12 caracteres, maiúscula e número), com ou sem a flag.
 */
const MAIS_FORTE: PoliticaLigada = {
  enabled: true,
  min_length: 12,
  max_length: 72,
  require_upper: true,
  require_digit: true,
  is_default: false,
  rules: [
    { key: 'min_length', label: '12 caracteres ou mais' },
    { key: 'upper', label: 'Uma letra maiúscula' },
    { key: 'digit', label: 'Um número' },
  ],
};
const AMOSTRAS = 5000;

describe('senha provisória gerada no navegador (E5.8)', () => {
  it(`${AMOSTRAS} amostras: 12 caracteres do alfabeto sem ambíguos, com maiúscula, minúscula e número, e cumprem a regra mais forte`, () => {
    for (let i = 0; i < AMOSTRAS; i += 1) {
      const s = gerarSenhaProvisoria();
      expect(s).toHaveLength(12);
      expect([...s].every((ch) => ALFABETO_PROVISORIA.includes(ch))).toBe(true);
      expect(/[A-Z]/.test(s) && /[a-z]/.test(s) && /[0-9]/.test(s)).toBe(true);
      expect(senhaCumpre(s, MAIS_FORTE)).toBe(true);
      expect(conferirRegras(s, MAIS_FORTE).every((r) => r.ok)).toBe(true);
    }
  });

  it('sem os ambíguos (0/O/o, 1/I/l/i) para ditar ou copiar à mão', () => {
    expect(ALFABETO_PROVISORIA).not.toMatch(/[0O1Iloi]/);
  });

  it('não se repete (o sorteio é do crypto do navegador, não Math.random)', () => {
    const vistas = new Set(Array.from({ length: 2000 }, () => gerarSenhaProvisoria()));
    expect(vistas.size).toBe(2000);
  });

  it('sorteio injetável: o pior caso (sempre o 1º) ainda tem as três classes', () => {
    const s = gerarSenhaProvisoria(() => 0);
    expect(s).toHaveLength(12);
    expect(/[A-Z]/.test(s) && /[a-z]/.test(s) && /[0-9]/.test(s)).toBe(true);
  });

  it('inteiroAleatorio fica em [0, max) e cobre a faixa inteira (sem viés de módulo grosseiro)', () => {
    const vistos = new Array(ALFABETO_PROVISORIA.length).fill(0);
    for (let i = 0; i < 20000; i += 1) {
      const n = inteiroAleatorio(ALFABETO_PROVISORIA.length);
      expect(Number.isInteger(n) && n >= 0 && n < ALFABETO_PROVISORIA.length).toBe(true);
      vistos[n] += 1;
    }
    expect(vistos.every((c) => c > 0)).toBe(true);
    expect(() => inteiroAleatorio(0)).toThrow();
  });

  it('mensagem do WhatsApp da equipe: sem a promessa de troca obrigatória (D2: a equipe troca quando quiser)', () => {
    const base = { telefone: '(31) 99999-0000', nome: 'Rebeca Lima', email: 'rebeca@x.com', senha: 'Ab3kq9Zt2mPw', endereco: 'https://praca/entrar' };
    const campo = decodeURIComponent(linkWhatsappAcesso(base)!);
    const equipe = decodeURIComponent(linkWhatsappAcesso({ ...base, trocaObrigatoria: false })!);
    expect(campo).toContain('No primeiro acesso você vai criar uma nova senha.');
    expect(equipe).not.toContain('No primeiro acesso');
    expect(equipe).toContain('Troque a senha quando entrar, em "Trocar senha".');
    expect(equipe).toContain('Usuário: rebeca@x.com');
  });
});
