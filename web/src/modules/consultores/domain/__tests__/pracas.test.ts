import { describe, expect, it } from 'vitest';
import { atuaNaPraca } from '../pracas';

describe('atuaNaPraca (contrato §44.7)', () => {
  it('sem o conjunto (flag desligada): só a principal, como hoje', () => {
    expect(atuaNaPraca({ praca_id: 'a' }, 'a')).toBe(true);
    expect(atuaNaPraca({ praca_id: 'a' }, 'b')).toBe(false);
  });
  it('com o conjunto: qualquer praça dele', () => {
    expect(atuaNaPraca({ praca_id: 'a', praca_ids: ['a', 'b'] }, 'b')).toBe(true);
    expect(atuaNaPraca({ praca_id: 'a', praca_ids: ['a', 'b'] }, 'c')).toBe(false);
  });
  it('sem praça escolhida: ninguém', () => {
    expect(atuaNaPraca({ praca_id: 'a' }, undefined)).toBe(false);
  });
});
