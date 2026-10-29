import { describe, expect, it } from 'vitest';
import { abaDeMensagens } from '../aba';

describe('abaDeMensagens', () => {
  it('lê a aba pedida na URL', () => {
    expect(abaDeMensagens('?aba=cadencias')).toBe('cadencias');
    expect(abaDeMensagens('aba=disparos')).toBe('disparos');
    expect(abaDeMensagens('?x=1&aba=cadencias')).toBe('cadencias');
  });

  it('abre em modelos sem aba, com valor desconhecido ou vazio', () => {
    expect(abaDeMensagens('')).toBe('modelos');
    expect(abaDeMensagens(null)).toBe('modelos');
    expect(abaDeMensagens(undefined)).toBe('modelos');
    expect(abaDeMensagens('?aba=cadências')).toBe('modelos');
    expect(abaDeMensagens('?aba=qualquer')).toBe('modelos');
    expect(abaDeMensagens('?aba=modelos')).toBe('modelos');
  });
});
