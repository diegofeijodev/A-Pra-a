import { describe, expect, it } from 'vitest';
import type { PoliticaLigada } from '@/modules/acesso/domain/senha';
import { ajudaDaSenha, esquemaTrocaSenha, MENSAGEM_SENHA, textosTrocaSenha } from '../trocar-senha';

const erros = (obrigatoria: boolean, v: { atual: string; nova: string; confirma: string }) => {
  const r = esquemaTrocaSenha(obrigatoria).safeParse(v);
  return r.success ? {} : Object.fromEntries(r.error.issues.map((i) => [i.path.join('.'), i.message]));
};

describe('esquema da troca de senha (equipe e consultor)', () => {
  it('válido: atual 6–72, nova 8–72, confirmação igual e diferente da atual', () => {
    expect(esquemaTrocaSenha().safeParse({ atual: 'praca123', nova: 'NovaSenha9', confirma: 'NovaSenha9' }).success).toBe(true);
  });

  it('confirmação diferente: "As senhas não coincidem." no campo de confirmar', () => {
    expect(erros(false, { atual: 'praca123', nova: 'NovaSenha9', confirma: 'NovaSenha8' })).toEqual({ confirma: MENSAGEM_SENHA.diferentes });
  });

  it('nova igual à atual: mensagem no campo da nova (o servidor responderia SAME_PASSWORD)', () => {
    expect(erros(false, { atual: 'praca1234', nova: 'praca1234', confirma: 'praca1234' })).toEqual({ nova: MENSAGEM_SENHA.igual });
  });

  it('limites: nova com menos de 8 ou mais de 72; atual com menos de 6 (texto da provisória na troca obrigatória)', () => {
    expect(erros(false, { atual: 'praca123', nova: 'Curta12', confirma: 'Curta12' }).nova).toBe(MENSAGEM_SENHA.curta);
    const longa = 'A1'.repeat(37);
    expect(erros(false, { atual: 'praca123', nova: longa, confirma: longa }).nova).toBe(MENSAGEM_SENHA.longa);
    expect(erros(false, { atual: '123', nova: 'NovaSenha9', confirma: 'NovaSenha9' }).atual).toBe(MENSAGEM_SENHA.atual);
    expect(erros(true, { atual: '123', nova: 'NovaSenha9', confirma: 'NovaSenha9' }).atual).toBe(MENSAGEM_SENHA.provisoria);
  });

  it('textos: "Senha provisória" e o aviso de segurança só na troca obrigatória', () => {
    expect(textosTrocaSenha(true)).toEqual({ rotuloAtual: 'Senha provisória', subtitulo: 'Por segurança, troque a senha provisória antes de continuar.' });
    expect(textosTrocaSenha(false)).toEqual({ rotuloAtual: 'Senha atual', subtitulo: 'Defina uma nova senha.' });
  });

  it('ajuda: com a regra ligada é a lista viva (sem texto); desligada, "Mínimo de 8 caracteres." (sem "letra maiúscula")', () => {
    const ligada: PoliticaLigada = {
      enabled: true,
      min_length: 8,
      max_length: 72,
      require_upper: true,
      require_digit: true,
      is_default: true,
      rules: [{ key: 'min_length', label: '8 caracteres ou mais' }],
    };
    expect(ajudaDaSenha(ligada)).toBeNull();
    expect(ajudaDaSenha({ enabled: false })).toBe('Mínimo de 8 caracteres.');
    expect(ajudaDaSenha(undefined)).toBe('Mínimo de 8 caracteres.');
    // O browser-check confere que, desligada, "Uma letra maiúscula" não aparece na tela.
    expect(ajudaDaSenha(undefined)).not.toMatch(/letra maiúscula/i);
  });
});
