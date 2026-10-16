import { describe, expect, it } from 'vitest';
import { linhasDoExcel } from '../intake';

describe('linhasDoExcel', () => {
  it('primeira linha é o cabeçalho; linhas vazias saem; tudo vira texto', () => {
    const p = linhasDoExcel([
      ['Nome', 'CNAE', 'Latitude', null],
      ['Bar do Zé', 5611201, -19.9312, 'x'],
      [null, '', null, null],
      ['Hotel', '5510-8/01', 1e-7, null],
    ]);
    expect(p.kind).toBe('xlsx');
    expect(p.columns).toEqual(['Nome', 'CNAE', 'Latitude', 'coluna 4']);
    expect(p.rows).toHaveLength(2);
    expect(p.rows[0]).toEqual({ Nome: 'Bar do Zé', CNAE: '5611201', Latitude: '-19.9312', 'coluna 4': 'x' });
    expect(p.rows[1]!['coluna 4']).toBe('');
    expect(p.rows[1]!.Latitude).toBe('0.0000001');
  });

  it('data do Excel vira YYYY-MM-DD', () => {
    const p = linhasDoExcel([['Abertura'], [new Date('2024-03-05T00:00:00Z')]]);
    expect(p.rows[0]).toEqual({ Abertura: '2024-03-05' });
  });
});
