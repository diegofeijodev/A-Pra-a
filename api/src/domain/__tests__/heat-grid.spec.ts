import {
  CELULAS_M,
  MAX_CELULAS,
  celulaDe,
  centroDaCelula,
  latReferencia,
  minutosAproximados,
  montarCelulas,
  proximaCelula,
  resumoCobertura,
  tamanhoCelula,
  validarBbox,
  validarPeriodo,
} from '../heat-grid';

const HOJE = '2026-10-19';

describe('grade: tamanho e snap de célula', () => {
  it('latReferencia arredonda ao grau (a grade não anda com o viewport)', () => {
    expect(latReferencia(-23.6)).toBe(-24);
    expect(latReferencia(-23.4)).toBe(-23);
    expect(latReferencia(-23.45)).toBe(latReferencia(-23.1));
  });

  it('tamanhoCelula: Δlat = m/111320 e Δlng cresce com a latitude', () => {
    const t = tamanhoCelula(250, -23);
    expect(t.m).toBe(250);
    expect(t.dlat).toBeCloseTo(250 / 111320, 9);
    expect(t.dlng).toBeGreaterThan(t.dlat);
    expect(t.dlng).toBeCloseTo(250 / (111320 * Math.cos((23 * Math.PI) / 180)), 9);
  });

  it('celulaDe usa floor (negativos caem na célula de baixo) e é estável', () => {
    const t = tamanhoCelula(250, -23);
    const a = celulaDe({ lat: -23.6, lng: -46.66 }, t);
    expect(a).toEqual(celulaDe({ lat: -23.6, lng: -46.66 }, t));
    expect(a.i).toBe(Math.floor(-23.6 / t.dlat));
    expect(a.j).toBe(Math.floor(-46.66 / t.dlng));
    // dois pontos a poucos metros caem na mesma célula; a 1 km, em outra
    expect(celulaDe({ lat: -23.6001, lng: -46.66 }, t)).toEqual(a);
    expect(celulaDe({ lat: -23.61, lng: -46.66 }, t)).not.toEqual(a);
  });

  it('o centro da célula devolve a mesma célula (ida e volta) e fica a menos de meia célula do ponto', () => {
    const t = tamanhoCelula(100, -23);
    const p = { lat: -23.60123, lng: -46.66541 };
    const c = celulaDe(p, t);
    const centro = centroDaCelula(c, t);
    expect(celulaDe(centro, t)).toEqual(c);
    expect(Math.abs(centro.lat - p.lat)).toBeLessThanOrEqual(t.dlat / 2 + 1e-12);
    expect(Math.abs(centro.lng - p.lng)).toBeLessThanOrEqual(t.dlng / 2 + 1e-12);
  });

  it('proximaCelula sobe a escada e termina em null', () => {
    expect(CELULAS_M).toEqual([100, 250, 500, 1000]);
    expect(proximaCelula(100)).toBe(250);
    expect(proximaCelula(500)).toBe(1000);
    expect(proximaCelula(1000)).toBeNull();
  });
});

describe('montarCelulas: centro, ordem, teto e máximo', () => {
  const t = tamanhoCelula(250, -23);

  it('converte (i,j) em centro, preserva os campos da camada e não vaza i/j', () => {
    const r = montarCelulas([{ i: 10, j: -20, n: 3, leads: 2 }], t);
    expect(r.cells).toHaveLength(1);
    expect(r.cells[0]).toEqual({ ...centroDaCelula({ i: 10, j: -20 }, t), n: 3, leads: 2 });
    expect(r.cells[0]).not.toHaveProperty('i');
    expect(r.max).toBe(3);
    expect(r.truncated).toBe(false);
  });

  it('sem linhas: vazio, max 0', () => {
    expect(montarCelulas([], t)).toEqual({ cells: [], max: 0, truncated: false });
  });

  it('acima do teto fica com as de maior peso (empate por i,j) e marca truncated', () => {
    const linhas = Array.from({ length: 12 }, (_, k) => ({ i: k, j: 0, n: k % 4 }));
    const r = montarCelulas(linhas, t, 5);
    expect(r.cells).toHaveLength(5);
    expect(r.truncated).toBe(true);
    expect(r.cells.every((c) => c.n >= 2)).toBe(true);
    expect(r.max).toBe(3);
    expect(montarCelulas(linhas, t, 12).truncated).toBe(false);
  });

  it('o teto padrão é 5.000', () => {
    expect(MAX_CELULAS).toBe(5000);
  });

  it('cobertura com n=0 (tudo visitado) não é desenhada como falta', () => {
    const r = montarCelulas([{ i: 1, j: 1, n: 0, total: 2, visited: 2 }, { i: 2, j: 2, n: 1, total: 1, visited: 0 }], t, 10, { descartarZero: true });
    expect(r.cells).toHaveLength(1);
    expect(r.cells[0].total).toBe(1);
  });
});

describe('resumos', () => {
  it('resumoCobertura: conta explícita e percent inteiro; 0 leads → 0%', () => {
    expect(resumoCobertura(140, 87)).toEqual({ leads_total: 140, leads_visited: 87, leads_missing: 53, percent: 62 });
    expect(resumoCobertura(0, 0)).toEqual({ leads_total: 0, leads_visited: 0, leads_missing: 0, percent: 0 });
    expect(resumoCobertura(3, 5).leads_missing).toBe(0);
  });
  it('minutosAproximados: 5 min por ponto de trajeto', () => {
    expect(minutosAproximados(0)).toBe(0);
    expect(minutosAproximados(7)).toBe(35);
  });
});

describe('validarPeriodo', () => {
  it('sem nada: hoje (dia de Brasília informado), só from: até hoje', () => {
    expect(validarPeriodo({}, HOJE)).toEqual({ ok: true, from: HOJE, to: HOJE });
    expect(validarPeriodo({ from: '2026-10-12' }, HOJE)).toEqual({ ok: true, from: '2026-10-12', to: HOJE });
    expect(validarPeriodo({ to: '2026-10-10' }, HOJE)).toEqual({ ok: true, from: '2026-10-10', to: '2026-10-10' });
  });
  it('92 dias inclusive passa; 93 não', () => {
    expect(validarPeriodo({ from: '2026-07-20', to: '2026-10-19' }, HOJE).ok).toBe(true); // 92 dias
    const r = validarPeriodo({ from: '2026-07-19', to: '2026-10-19' }, HOJE);
    expect(r.ok).toBe(false);
  });
  it('from depois de to e datas inexistentes são recusadas', () => {
    expect(validarPeriodo({ from: '2026-10-19', to: '2026-10-18' }, HOJE).ok).toBe(false);
    expect(validarPeriodo({ from: '2026-02-31' }, HOJE).ok).toBe(false);
  });
});

describe('validarBbox', () => {
  it('lê sul,oeste,norte,leste', () => {
    expect(validarBbox('-23.62,-46.68,-23.58,-46.64')).toEqual({ ok: true, bbox: { sul: -23.62, oeste: -46.68, norte: -23.58, leste: -46.64 } });
  });
  it('recusa lixo, ordem invertida, fora do Brasil e janela grande demais', () => {
    expect(validarBbox('a,b,c,d').ok).toBe(false);
    expect(validarBbox('-23.62,-46.68,-23.58').ok).toBe(false);
    expect(validarBbox('-23.58,-46.68,-23.62,-46.64').ok).toBe(false);
    expect(validarBbox('-23.62,-46.64,-23.58,-46.68').ok).toBe(false);
    expect(validarBbox('40,-3,41,-2').ok).toBe(false);
    expect(validarBbox('-30,-50,-20,-40').ok).toBe(false);
    expect(validarBbox('-23.62,-46.68,-23.58,Infinity').ok).toBe(false);
  });
});
