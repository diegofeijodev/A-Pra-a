import { describe, expect, it } from 'vitest';
import { alternarCodigo, juntarPaginas, linhasDoBalao, pinosSchema, pinosVisiveis, SIMBOLO, type PinosPagina } from '../pinos';

const pagina = (pins: PinosPagina['pins'], next: string | null): PinosPagina =>
  pinosSchema.parse({
    mode: 'resultado',
    pracas: [{ id: 'p', name: 'Moema' }],
    legend: [
      { code: 'a_visitar', label: 'A visitar', color: '#2563eb', shape: 'circulo', n: 2 },
      { code: 'fechado', label: 'Estabelecimento fechado', color: '#9A9A92', shape: 'traco', n: 1 },
    ],
    pins,
    next_cursor: next,
    total: 3,
    without_location: 5,
    conta: 'x',
  });

describe('mapa por situação (UX §3.3)', () => {
  it('junta as páginas; legenda e totais do filtro inteiro (da primeira)', () => {
    const m = juntarPaginas([pagina([['a', 1, 2, 'a_visitar'], ['b', 1, 2, 'fechado']], 'b'), pagina([['c', 1, 2, 'a_visitar']], null)]);
    expect(m.pins).toHaveLength(3);
    expect(m.total).toBe(m.legend.reduce((a, l) => a + l.n, 0));
    expect(m.truncado).toBe(false);
    expect(m.without_location).toBe(5);
  });
  it('acima do teto: corta e marca "truncado"', () => {
    const m = juntarPaginas([pagina([['a', 1, 2, 'a_visitar'], ['b', 1, 2, 'fechado']], 'b')], 1);
    expect(m.pins).toHaveLength(1);
    expect(m.truncado).toBe(true);
  });
  it('M1: tocar na legenda esconde e mostra a situação', () => {
    const pins: PinosPagina['pins'] = [['a', 1, 2, 'a_visitar'], ['b', 1, 2, 'fechado']];
    const esc = alternarCodigo(new Set(), 'fechado');
    expect(pinosVisiveis(pins, esc).map((p) => p[0])).toEqual(['a']);
    expect(pinosVisiveis(pins, alternarCodigo(esc, 'fechado'))).toHaveLength(2);
  });
  it('M2: cada forma tem um símbolo diferente', () => {
    expect(new Set(Object.values(SIMBOLO)).size).toBe(Object.keys(SIMBOLO).length);
  });
  it('balão: texto puro, telefone só mascarado com o tipo', () => {
    const l = linhasDoBalao({
      id: 'a', name: '<b>Bar</b>', address: 'Rua A', city: 'BH', praca_id: 'p', stage: 3, stage_label: '3. Conversa aberta',
      category: { code: 'retornar', label: 'Quer retorno', color: '#9333ea' },
      last_visit: { day: '2026-10-22', label: 'Quer retorno', consultant_name: 'Ana' },
      phone: { masked: '(31) 9****-4321', kind: 'whatsapp' },
    });
    expect(l[0]).toBe('<b>Bar</b>');
    expect(l).toContain('Telefone (31) 9****-4321 · celular (WhatsApp)');
    expect(l[2]).toBe('Última visita qui 22/10 · Ana (Quer retorno)');
  });
});
