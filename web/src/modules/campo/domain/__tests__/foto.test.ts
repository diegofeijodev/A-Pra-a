import { describe, expect, it } from 'vitest';
import { dimensoesReduzidas, escolherEnvio, TETO_FOTO_BYTES } from '../foto';

describe('dimensoesReduzidas', () => {
  it('reduz o lado maior para 1600 px mantendo a proporção', () => {
    expect(dimensoesReduzidas(4032, 3024)).toEqual({ largura: 1600, altura: 1200 });
    expect(dimensoesReduzidas(3024, 4032)).toEqual({ largura: 1200, altura: 1600 });
  });
  it('não aumenta foto pequena', () => {
    expect(dimensoesReduzidas(800, 600)).toEqual({ largura: 800, altura: 600 });
  });
});

describe('escolherEnvio', () => {
  it('usa a reduzida quando o navegador conseguiu converter', () => {
    expect(escolherEnvio({ tipo: 'image/heic', bytes: 3_000_000 }, { bytes: 400_000 })).toEqual({ usar: 'reduzida' });
  });
  it('HEIC que o navegador não decodifica: explica, não manda', () => {
    const r = escolherEnvio({ tipo: 'image/heic', bytes: 2_000_000 }, null);
    expect('erro' in r && r.erro).toMatch(/Tire de novo/);
  });
  it('sem conversão, manda o original JPEG/PNG/WEBP até 5 MB', () => {
    expect(escolherEnvio({ tipo: 'image/jpeg', bytes: 1_000_000 }, null)).toEqual({ usar: 'original' });
    expect(escolherEnvio({ tipo: 'image/webp', bytes: TETO_FOTO_BYTES }, null)).toEqual({ usar: 'original' });
  });
  it('original acima de 5 MB sem conversão: explica', () => {
    expect('erro' in escolherEnvio({ tipo: 'image/jpeg', bytes: TETO_FOTO_BYTES + 1 }, null)).toBe(true);
  });
  it('reduzida vazia ou acima do teto não vale', () => {
    expect(escolherEnvio({ tipo: 'image/jpeg', bytes: 900_000 }, { bytes: 0 })).toEqual({ usar: 'original' });
    expect('erro' in escolherEnvio({ tipo: 'image/heic', bytes: 9_000_000 }, { bytes: TETO_FOTO_BYTES + 1 })).toBe(true);
  });
});
