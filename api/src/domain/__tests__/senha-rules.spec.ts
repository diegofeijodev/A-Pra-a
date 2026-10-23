/** Lote E, L9a (contrato §41.2): regra de senha nova + senha provisória que sempre cumpre a política mais forte permitida. */
import {
  ALFABETO_PROVISORIA,
  LIMITES_POLITICA,
  POLITICA_LOVABLE,
  POLITICA_MAIS_FORTE,
  aplicarPolitica,
  gerarSenhaProvisoria,
  lerPolitica,
  mensagemSenhaFraca,
  regrasDaPolitica,
  validarSenhaNova,
} from '../senha-rules';
import { gerarSenhaProvisoria as daCampo } from '../campo-rules';

describe('política', () => {
  it('nulo = a da Lovable (8, 1 maiúscula, 1 número)', () => {
    expect(POLITICA_LOVABLE).toEqual({ min_length: 8, require_upper: true, require_digit: true });
    expect(lerPolitica(null)).toEqual({ ...POLITICA_LOVABLE, is_default: true });
    expect(lerPolitica(undefined)).toEqual({ ...POLITICA_LOVABLE, is_default: true });
  });
  it('gravada vale chave a chave; inválida cai no padrão da chave', () => {
    expect(lerPolitica({ min_length: 10, require_upper: false })).toEqual({ min_length: 10, require_upper: false, require_digit: true, is_default: false });
    expect(lerPolitica({ min_length: 99, require_digit: 'sim' })).toEqual({ ...POLITICA_LOVABLE, is_default: false });
  });
  it('PUT parcial: null = ausente; fora da faixa = erro com o nome do campo', () => {
    expect(aplicarPolitica(POLITICA_LOVABLE, { min_length: 12, require_upper: null })).toEqual({ ok: true, politica: { ...POLITICA_LOVABLE, min_length: 12 } });
    expect(aplicarPolitica(POLITICA_LOVABLE, { min_length: 7 })).toEqual({ ok: false, erro: 'min_length: inteiro de 8 a 12.' });
    expect(aplicarPolitica(POLITICA_LOVABLE, { min_length: 13 })).toEqual({ ok: false, erro: 'min_length: inteiro de 8 a 12.' });
    expect(aplicarPolitica(POLITICA_LOVABLE, { require_digit: 1 })).toEqual({ ok: false, erro: 'require_digit: verdadeiro ou falso.' });
  });
  it('a mais forte permitida é o teto da faixa com as duas exigências', () => {
    expect(LIMITES_POLITICA).toEqual({ min: 8, max: 12, max_length: 72 });
    expect(POLITICA_MAIS_FORTE).toEqual({ min_length: 12, require_upper: true, require_digit: true });
  });
  it('regras na ordem da tela', () => {
    expect(regrasDaPolitica(POLITICA_LOVABLE)).toEqual([
      { key: 'min_length', label: '8 caracteres ou mais' },
      { key: 'upper', label: 'Uma letra maiúscula' },
      { key: 'digit', label: 'Um número' },
    ]);
    expect(regrasDaPolitica({ min_length: 10, require_upper: false, require_digit: false })).toEqual([{ key: 'min_length', label: '10 caracteres ou mais' }]);
  });
});

describe('validarSenhaNova', () => {
  it('lista só o que falta, na ordem', () => {
    expect(validarSenhaNova('abc', POLITICA_LOVABLE)).toEqual(['min_length', 'upper', 'digit']);
    expect(validarSenhaNova('abcdefgh', POLITICA_LOVABLE)).toEqual(['upper', 'digit']);
    expect(validarSenhaNova('Abcdefgh', POLITICA_LOVABLE)).toEqual(['digit']);
    expect(validarSenhaNova('Abcdefg1', POLITICA_LOVABLE)).toEqual([]);
    expect(validarSenhaNova('abcdefgh', { min_length: 8, require_upper: false, require_digit: false })).toEqual([]);
  });
  it('maiúscula acentuada conta; acima de 72 falha no tamanho', () => {
    expect(validarSenhaNova('Ébcdefg1', POLITICA_LOVABLE)).toEqual([]);
    expect(validarSenhaNova(`A1${'a'.repeat(71)}`, POLITICA_LOVABLE)).toEqual(['max_length']);
  });
  it('mensagem do 400 WEAK_PASSWORD (sem a senha)', () => {
    expect(mensagemSenhaFraca(['min_length', 'upper', 'digit'], POLITICA_LOVABLE)).toBe('A senha precisa de: 8 caracteres ou mais, 1 letra maiúscula, 1 número.');
    expect(mensagemSenhaFraca(['upper'], POLITICA_LOVABLE)).toBe('A senha precisa de: 1 letra maiúscula.');
    expect(mensagemSenhaFraca(['max_length'], POLITICA_LOVABLE)).toBe('A senha precisa de: no máximo 72 caracteres.');
  });
});

describe('senha provisória (propriedade, 1.000 amostras)', () => {
  it('sempre 12 caracteres do alfabeto sem ambíguos, com maiúscula, minúscula e número: cumpre a política mais forte', () => {
    expect(ALFABETO_PROVISORIA).not.toMatch(/[0O1Iil]/);
    for (let i = 0; i < 1000; i += 1) {
      const s = gerarSenhaProvisoria();
      expect(s).toHaveLength(12);
      expect([...s].every((ch) => ALFABETO_PROVISORIA.includes(ch))).toBe(true);
      expect(s).toMatch(/[A-Z]/);
      expect(s).toMatch(/[a-z]/);
      expect(s).toMatch(/[0-9]/);
      expect(validarSenhaNova(s, POLITICA_MAIS_FORTE)).toEqual([]);
      expect(validarSenhaNova(s, POLITICA_LOVABLE)).toEqual([]);
    }
  });
  it('mesmo com um sorteio viciado (sempre 0) cumpre a política', () => {
    const s = gerarSenhaProvisoria(() => 0);
    expect(validarSenhaNova(s, POLITICA_MAIS_FORTE)).toEqual([]);
    expect(s).toHaveLength(12);
  });
  it('a do campo é a mesma função', () => {
    expect(daCampo).toBe(gerarSenhaProvisoria);
  });
});
