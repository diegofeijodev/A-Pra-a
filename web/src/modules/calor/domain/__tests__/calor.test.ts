import { describe, expect, it } from 'vitest';
import {
  bboxDaJanela,
  cantosDaCelula,
  celulaPorZoom,
  corDoCalor,
  degradeDaLegenda,
  erroDoPeriodo,
  filtrosParaQuery,
  intensidade,
  lerFiltros,
  periodoDoPreset,
  presetDoPeriodo,
  quadrasMaisIntensas,
  textoLegenda,
} from '../calor';

const HOJE = '2026-10-19';
const sp = (s: string) => new URLSearchParams(s);

describe('intensidade e rampa de cor', () => {
  it('0 sem dados, 1 no máximo, raiz no meio e nunca passa de 1', () => {
    expect(intensidade(0, 10)).toBe(0);
    expect(intensidade(5, 0)).toBe(0);
    expect(intensidade(10, 10)).toBe(1);
    expect(intensidade(2.5, 10)).toBeCloseTo(0.5);
    expect(intensidade(50, 10)).toBe(1);
  });
  it('as paradas do UX §5.3 saem exatas (escuro e claro)', () => {
    expect(corDoCalor(0.15, true)).toEqual({ cor: '#b4701a', opacidade: 0.25 });
    expect(corDoCalor(0.4, true)).toEqual({ cor: '#eca826', opacidade: 0.55 });
    expect(corDoCalor(1, true)).toEqual({ cor: '#ffc857', opacidade: 0.75 });
    expect(corDoCalor(0.4, false)).toEqual({ cor: '#e08a12', opacidade: 0.6 });
    expect(corDoCalor(1, false)).toEqual({ cor: '#6b240a', opacidade: 0.75 });
  });
  it('a ponta baixa é transparente (não preta) e a opacidade nunca passa de 75%', () => {
    for (const dark of [true, false]) {
      expect(corDoCalor(0, dark).opacidade).toBe(0);
      for (let t = 0; t <= 1; t += 0.05) expect(corDoCalor(t, dark).opacidade).toBeLessThanOrEqual(0.75);
    }
  });
  it('a opacidade só cresce com a intensidade e valores fora de 0..1 ou NaN são contidos', () => {
    for (const dark of [true, false]) {
      let ant = -1;
      for (let t = 0; t <= 1.0001; t += 0.05) {
        const o = corDoCalor(t, dark).opacidade;
        expect(o).toBeGreaterThanOrEqual(ant);
        ant = o;
      }
    }
    expect(corDoCalor(7, true)).toEqual(corDoCalor(1, true));
    expect(corDoCalor(NaN, true)).toEqual(corDoCalor(0, true));
  });
  it('nenhuma cor da rampa é azul/ciano/verde (o azul nunca domina o canal)', () => {
    for (const dark of [true, false])
      for (let t = 0.1; t <= 1; t += 0.1) {
        const h = corDoCalor(t, dark).cor;
        const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
        expect(r).toBeGreaterThan(g);
        expect(g).toBeGreaterThanOrEqual(b);
      }
  });
  it('degradê da legenda usa a mesma rampa', () => {
    expect(degradeDaLegenda(true)).toContain('rgba(236, 168, 38, 0.55) 40%');
  });
});

describe('quadra, zoom e recorte', () => {
  it('celulaPorZoom: mais zoom, quadra menor', () => {
    expect([18, 16, 15, 14, 13, 12, 11, 4].map(celulaPorZoom)).toEqual([100, 100, 250, 250, 500, 500, 1000, 1000]);
  });
  it('bboxDaJanela arredonda para fora e fica no Brasil', () => {
    expect(bboxDaJanela({ south: -23.6204, west: -46.6806, north: -23.5801, east: -46.6401 })).toBe('-23.621,-46.681,-23.58,-46.64');
    expect(bboxDaJanela({ south: -40, west: -46.9, north: -39, east: -46.1 })).toBeNull(); // fora do Brasil
  });
  it('janela de mais de 3° (zoom longe) → sem recorte', () => {
    expect(bboxDaJanela({ south: -25, west: -50, north: -20, east: -45 })).toBeNull();
  });
  it('cantosDaCelula centra o retângulo', () => {
    expect(cantosDaCelula({ lat: 10, lng: 20 }, { dlat: 2, dlng: 4 })).toEqual([[9, 18], [11, 22]]);
  });
});

describe('período', () => {
  it('presets contam hoje (7 dias = hoje e os 6 anteriores) e voltam do período ao preset', () => {
    expect(periodoDoPreset('hoje', HOJE)).toEqual({ from: HOJE, to: HOJE });
    expect(periodoDoPreset('7d', HOJE)).toEqual({ from: '2026-10-13', to: HOJE });
    expect(periodoDoPreset('30d', HOJE)).toEqual({ from: '2026-09-20', to: HOJE });
    expect(presetDoPeriodo('2026-10-13', HOJE, HOJE)).toBe('7d');
    expect(presetDoPeriodo('2026-10-01', HOJE, HOJE)).toBeNull();
  });
  it('erroDoPeriodo: ordem invertida, mais de 92 dias, datas faltando', () => {
    expect(erroDoPeriodo('2026-10-19', '2026-10-01')).toBe('A data inicial vem depois da final.');
    expect(erroDoPeriodo('2026-07-20', '2026-10-19')).toBeNull();
    expect(erroDoPeriodo('2026-07-19', '2026-10-19')).toBe('Escolha no máximo 92 dias.');
    expect(erroDoPeriodo('', '2026-10-19')).toBe('Escolha as duas datas.');
  });
});

describe('filtros na URL', () => {
  const U = '00000000-0000-4000-8000-0000000000a1';
  it('ida e volta', () => {
    const f = { praca: U, consultor: null, camada: 'cobertura' as const, from: '2026-10-01', to: '2026-10-10' };
    expect(lerFiltros(sp(filtrosParaQuery(f)), HOJE)).toEqual(f);
  });
  it('lixo na URL cai no padrão: visitas, 7 dias, sem praça/consultor', () => {
    const f = lerFiltros(sp('praca=oi&consultor=<script>&camada=gps&de=ontem&ate=hoje'), HOJE);
    expect(f).toEqual({ praca: null, consultor: null, camada: 'visitas', from: '2026-10-13', to: HOJE });
  });
});

describe('textos com a conta', () => {
  it('legenda diz o lado da quadra, o que a cor mede e o valor da mais forte', () => {
    expect(textoLegenda('visitas', 250, 9)).toBe('Cada quadra do mapa tem cerca de 250 m de lado. A cor mostra quantas visitas (check-ins) houve na quadra; a mais forte tem 9 visitas.');
    expect(textoLegenda('passagem', 1000, 4)).toContain('1 km de lado');
    expect(textoLegenda('passagem', 100, 4)).toContain('≈ 20 min');
  });
  it('lista equivalente: ordenada por valor, no máximo 10, posição com vírgula', () => {
    const cells = Array.from({ length: 15 }, (_, k) => ({ lat: -23.5 - k / 1000, lng: -46.6, n: k + 1, leads: 1 }));
    const l = quadrasMaisIntensas(cells, 'visitas');
    expect(l).toHaveLength(10);
    expect(l[0]).toMatchObject({ pos: 1, ref: '-23,5140, -46,6000', texto: '15 visitas em 1 estabelecimento' });
  });
});
