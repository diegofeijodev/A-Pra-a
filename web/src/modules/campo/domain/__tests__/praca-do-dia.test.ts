import { describe, expect, it } from 'vitest';
import { mostraEscolhaDePraca, nomeDaPracaAtiva, pracaDoCorpo, pracaMarcada, type MePracas } from '../praca-do-dia';

const A = 'aaaaaaaa-0000-4000-8000-0000000000aa';
const B = 'bbbbbbbb-0000-4000-8000-0000000000bb';
const HOJE_DESLIGADA: MePracas = { features: { multi_praca: false }, consultant: { praca_id: A, praca_name: 'Moema' } };
const DUAS: MePracas = {
  features: { multi_praca: true },
  consultant: { praca_id: A, praca_name: 'Moema' },
  pracas: [
    { id: A, name: 'Moema', principal: true },
    { id: B, name: 'Pinheiros', principal: false },
  ],
  default_praca_id: B,
  active_praca_id: A,
};
const UMA: MePracas = { ...DUAS, pracas: [{ id: A, name: 'Moema', principal: true }], default_praca_id: A };

describe('praça do dia (contrato §44.5–§44.6, UX §3.8)', () => {
  it('a escolha só aparece com a flag, 2+ praças e sem roteiro hoje', () => {
    expect(mostraEscolhaDePraca(HOJE_DESLIGADA, false)).toBe(false);
    expect(mostraEscolhaDePraca(UMA, false)).toBe(false);
    expect(mostraEscolhaDePraca(DUAS, true)).toBe(false);
    expect(mostraEscolhaDePraca(DUAS, false)).toBe(true);
    expect(mostraEscolhaDePraca(undefined, false)).toBe(false);
  });
  it('vem marcada a escolhida (se no conjunto), senão o padrão do servidor, senão a principal', () => {
    expect(pracaMarcada(DUAS, null)).toBe(B);
    expect(pracaMarcada(DUAS, A)).toBe(A);
    expect(pracaMarcada(DUAS, 'outra')).toBe(B);
    expect(pracaMarcada({ ...DUAS, default_praca_id: undefined }, null)).toBe(A);
  });
  it('o corpo do início: nada sem a escolha na tela (desligada nunca manda); com ela, a marcada', () => {
    expect(pracaDoCorpo(HOJE_DESLIGADA, false, B)).toEqual({});
    expect(pracaDoCorpo(UMA, false, null)).toEqual({});
    expect(pracaDoCorpo(DUAS, true, A)).toEqual({});
    expect(pracaDoCorpo(DUAS, false, null)).toEqual({ praca_id: B });
    expect(pracaDoCorpo(DUAS, false, A)).toEqual({ praca_id: A });
  });
  it('cabeçalho: desligada = a principal; ligada = a da jornada, senão a ativa', () => {
    expect(nomeDaPracaAtiva(HOJE_DESLIGADA, B)).toBe('Moema');
    expect(nomeDaPracaAtiva(DUAS, B)).toBe('Pinheiros');
    expect(nomeDaPracaAtiva(DUAS, null)).toBe('Moema');
    expect(nomeDaPracaAtiva({ ...DUAS, active_praca_id: B }, undefined)).toBe('Pinheiros');
  });
});
