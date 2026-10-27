import { describe, expect, it } from 'vitest';
import { alternarCodigo, codigosDaEscolha, contornoDaForma, FORMAS, juntarPaginas, linhasDoBalao, listaCampoSchema, pilulasVisitados, pinosSchema, pinosVisiveis, rodapeDaLista, SIMBOLO, SITUACOES_LISTA, type PinosPagina } from '../pinos';

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

describe('aba "Clientes" do representante > Visitados (contrato §34.7)', () => {
  it('"Todos" = todas as situações menos "A visitar"; uma pílula = só a dela', () => {
    expect(codigosDaEscolha('todos')).toEqual(['cadastrado', 'ja_usa', 'retornar', 'nao_contrata', 'nao_cadastrado', 'fechado']);
    expect(codigosDaEscolha('fechado')).toEqual(['fechado']);
  });

  it('pílulas: "Todos" primeiro e soma as que entram nele (sem "A visitar"); sem resposta ainda, sem número', () => {
    const p = pilulasVisitados({ a_visitar: 9, cadastrado: 2, nao_cadastrado: 1 });
    expect(p.map((x) => x.rotulo)).toEqual(['Todos', 'Cadastrou', 'Já usa o Freela', 'Quer retorno', 'Não contrata freelas', 'Sem interesse', 'Estabelecimento fechado']);
    expect(p[0]).toMatchObject({ escolha: 'todos', n: 3 });
    expect(p.find((x) => x.escolha === 'ja_usa')?.n).toBe(0);
    expect(pilulasVisitados(undefined).every((x) => x.n === null)).toBe(true);
    // Cor nunca sozinha: toda situação tem símbolo.
    expect(SITUACOES_LISTA.every((s) => !!SIMBOLO[s.shape])).toBe(true);
  });

  it('resposta sem `pracas` e telefone só mascarado', () => {
    const r = listaCampoSchema.parse({
      counts: { cadastrado: 1 },
      total: 1,
      without_location: 0,
      items: [{ id: 'l', name: 'Bar', address: 'Rua A', city: 'BH', praca_id: 'p', code: 'cadastrado', label: 'Cadastrou', color: '#16a34a', has_location: true, phone: { masked: '(31) 9****-4321', kind: 'whatsapp' }, last_visit: null }],
      next_cursor: null,
      conta: 'x',
    });
    expect(r.items[0]!.phone?.masked).toContain('****');
    expect('pracas' in r).toBe(false);
  });
});

describe('rodapé de Clientes (o número da pílula e o do rodapé batem)', () => {
  // As capturas de 27/10: 25 do seed (9 cadastrados pela etapa, 16 a visitar) + 6 de teste a visitar; 25 sem localização exata.
  const r = { counts: { a_visitar: 22, cadastrado: 9 }, total: 31, without_location: 25 };
  it('"Todos 9" na pílula = "9 nesta lista"; os 31 do filtro aparecem com os 22 a visitar que ficam fora', () => {
    expect(pilulasVisitados(r.counts)[0]).toMatchObject({ escolha: 'todos', n: 9 });
    expect(rodapeDaLista(r, 'todos')).toBe(
      '9 nesta lista de 31 clientes no filtro de praça e busca (22 ainda a visitar) · 25 dos 31 sem localização exata (não aparecem no mapa)',
    );
  });
  it('pílula de uma situação: o primeiro número é o dela', () => {
    expect(rodapeDaLista(r, 'nao_cadastrado').startsWith('0 nesta lista de 31 clientes')).toBe(true);
  });
});

describe('pino do mapa com a forma da legenda (cor nunca sozinha)', () => {
  it('cada forma da legenda tem desenho no pino; o círculo fica com o do Leaflet', () => {
    expect(contornoDaForma('circulo', 7)).toBeNull();
    const lados: Record<string, number> = { quadrado: 4, losango: 4, triangulo: 3, hexagono: 6, xis: 12, traco: 4 };
    for (const f of FORMAS.filter((x) => x !== 'circulo')) expect(contornoDaForma(f, 7)).toHaveLength(lados[f]!);
    // Toda situação da legenda tem símbolo E forma.
    for (const s of SITUACOES_LISTA) expect(SIMBOLO[s.shape]).toBeTruthy();
  });
  it('nenhum ponto passa de 1,2 × o raio (o Leaflet só redesenha a caixa do raio + espessura + 1 px)', () => {
    for (const f of FORMAS) {
      for (const [x, y] of contornoDaForma(f, 7) ?? []) expect(Math.hypot(x, y)).toBeLessThanOrEqual(1.2 * 7 + 1e-9);
    }
  });
  it('o ✕ é diagonal (braços nos cantos) e o traço é deitado (mais largo que alto)', () => {
    const xis = contornoDaForma('xis', 10)!;
    // Uma ponta em cada diagonal; nenhuma ponta no eixo (isso seria um "+", como a cruz das farmácias).
    for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) expect(xis.some(([x, y]) => x * sx > 4 && y * sy > 4)).toBe(true);
    expect(xis.some(([x, y]) => Math.abs(x) < 1 && Math.abs(y) > 9)).toBe(false);
    const traco = contornoDaForma('traco', 10)!;
    const largura = Math.max(...traco.map((p) => p[0])) - Math.min(...traco.map((p) => p[0]));
    const altura = Math.max(...traco.map((p) => p[1])) - Math.min(...traco.map((p) => p[1]));
    expect(largura).toBeGreaterThan(2 * altura);
  });
  it('"Sem interesse" não é o vermelho das farmácias do mapa', () => {
    expect(SITUACOES_LISTA.find((s) => s.code === 'nao_cadastrado')).toMatchObject({ color: '#9f1239', shape: 'xis' });
  });
});
