/**
 * Shoppings (contrato §40, fase L8): área do polígono do mapa aberto, critério de "grande" configurável com ajuste manual,
 * consulta montada no servidor (nunca QL do cliente) e a leitura da resposta do Overpass com geometria.
 */
import {
  areaAnelM2,
  areaPoligonoM2,
  CONFIG_SHOPPING,
  ehGrande,
  geometriaDoElemento,
  montarAneis,
  montarQueryLojas,
  montarQueryShoppings,
  normalizarShoppings,
  type MetricasShopping,
} from '../shopping-rules';
import { SEGMENTOS_PADRAO } from '../segmentos-rules';

// 1 grau de latitude ≈ 111.195 m (raio 6.371 km). Um quadrado de 100 m de lado perto do equador.
const GRAU_M = (Math.PI / 180) * 6_371_000;
const quadrado = (lat0: number, lng0: number, ladoM: number) => {
  const dLat = ladoM / GRAU_M;
  const dLng = ladoM / (GRAU_M * Math.cos((lat0 * Math.PI) / 180));
  return [
    { lat: lat0, lng: lng0 },
    { lat: lat0, lng: lng0 + dLng },
    { lat: lat0 + dLat, lng: lng0 + dLng },
    { lat: lat0 + dLat, lng: lng0 },
    { lat: lat0, lng: lng0 },
  ];
};
const comoOsm = (anel: { lat: number; lng: number }[]) => anel.map((p) => ({ lat: p.lat, lon: p.lng }));

describe('área do polígono (shoelace em projeção equirretangular)', () => {
  it('quadrado de 100 m dá cerca de 10.000 m² (no equador e em BH)', () => {
    expect(areaAnelM2(quadrado(0, 0, 100))).toBeGreaterThan(9_900);
    expect(areaAnelM2(quadrado(0, 0, 100))).toBeLessThan(10_100);
    expect(areaAnelM2(quadrado(-19.92, -43.94, 100))).toBeGreaterThan(9_900);
    expect(areaAnelM2(quadrado(-19.92, -43.94, 100))).toBeLessThan(10_100);
  });
  it('o sentido do anel não muda a área; anel com menos de 3 pontos = 0', () => {
    const a = quadrado(-19.92, -43.94, 200);
    expect(areaAnelM2([...a].reverse())).toBeCloseTo(areaAnelM2(a), 6);
    expect(areaAnelM2(a.slice(0, 2))).toBe(0);
  });
  it('relation com furo: externo menos interno', () => {
    const fora = quadrado(-19.92, -43.94, 200); // ~40.000
    const furo = quadrado(-19.9195, -43.9395, 100); // ~10.000 dentro
    const area = areaPoligonoM2({ externos: [fora], internos: [furo] });
    expect(area).toBeGreaterThan(29_500);
    expect(area).toBeLessThan(30_500);
  });
  it('nunca negativa', () => {
    expect(areaPoligonoM2({ externos: [quadrado(0, 0, 10)], internos: [quadrado(0, 0, 100)] })).toBe(0);
  });
});

describe('montar anéis a partir de trechos (outer partido em vários ways)', () => {
  it('junta trechos encadeados, inclusive invertidos, num anel fechado', () => {
    const q = quadrado(-19.92, -43.94, 100);
    const t1 = [q[0]!, q[1]!, q[2]!];
    const t2 = [q[3]!, q[2]!]; // invertido
    const t3 = [q[3]!, q[0]!];
    const aneis = montarAneis([t1, t2, t3]);
    expect(aneis).toHaveLength(1);
    expect(areaAnelM2(aneis[0]!)).toBeGreaterThan(9_900);
  });
  it('trecho que não fecha fica de fora (sem inventar área)', () => {
    const q = quadrado(-19.92, -43.94, 100);
    expect(montarAneis([[q[0]!, q[1]!, q[2]!]])).toEqual([]);
  });
});

describe('geometria de um elemento do Overpass', () => {
  it('way fechado = polígono com área e centro', () => {
    const g = geometriaDoElemento({ type: 'way', id: 1, geometry: comoOsm(quadrado(-19.92, -43.94, 150)), tags: { shop: 'mall' } });
    expect(g.geometry_kind).toBe('poligono');
    expect(g.area_m2).toBeGreaterThan(22_000);
    expect(g.area_m2).toBeLessThan(23_000);
    expect(g.centro.lat).toBeCloseTo(-19.92 + 75 / GRAU_M, 5);
  });
  it('relation multipolygon com outer partido e um inner', () => {
    const q = quadrado(-19.92, -43.94, 200);
    const furo = quadrado(-19.9195, -43.9395, 100);
    const g = geometriaDoElemento({
      type: 'relation',
      id: 9,
      tags: { shop: 'mall', type: 'multipolygon' },
      members: [
        { type: 'way', role: 'outer', geometry: comoOsm([q[0]!, q[1]!, q[2]!]) },
        { type: 'way', role: 'outer', geometry: comoOsm([q[2]!, q[3]!, q[0]!]) },
        { type: 'way', role: 'inner', geometry: comoOsm(furo) },
      ],
    });
    expect(g.geometry_kind).toBe('poligono');
    expect(g.area_m2).toBeGreaterThan(29_500);
    expect(g.area_m2).toBeLessThan(30_500);
  });
  it('shopping só como ponto (node) = sem área, centro do ponto', () => {
    const g = geometriaDoElemento({ type: 'node', id: 3, lat: -19.93, lon: -43.95, tags: { shop: 'mall' } });
    expect(g).toEqual({ geometry_kind: 'ponto', area_m2: null, centro: { lat: -19.93, lng: -43.95 } });
  });
  it('way aberto (contorno incompleto) = ponto no centro dos limites', () => {
    const q = quadrado(-19.92, -43.94, 100);
    const g = geometriaDoElemento({
      type: 'way',
      id: 4,
      geometry: comoOsm([q[0]!, q[1]!, q[2]!]),
      bounds: { minlat: -19.92, minlon: -43.94, maxlat: -19.919, maxlon: -43.939 },
    });
    expect(g.geometry_kind).toBe('ponto');
    expect(g.area_m2).toBeNull();
    expect(g.centro.lat).toBeCloseTo(-19.9195, 9);
    expect(g.centro.lng).toBeCloseTo(-43.9395, 9);
  });
});

describe('critério de shopping grande (padrão: área ≥ 20.000 m²; à mão vale mais)', () => {
  const cfg = CONFIG_SHOPPING.padrao;
  const m = (over: Partial<MetricasShopping> = {}): MetricasShopping => ({
    geometry_kind: 'poligono',
    area_m2: 25_000,
    pois_mapped: 10,
    levels: null,
    large_override: null,
    ...over,
  });
  it('padrões da decisão do orquestrador', () => {
    expect(cfg).toEqual({ criterio: 'area', area_min_m2: 20_000, lojas_min: 50, raio_lojas_m: 300, fora_da_rota_geral: true });
  });
  it('área: ≥ mínimo é grande; abaixo não; ponto (sem área) não; a conta diz os números', () => {
    const g = ehGrande(m(), cfg);
    expect(g).toMatchObject({ grande: true, por: 'criterio' });
    expect(g.conta).toBe('Área no mapa aberto: 25.000 m² (mínimo 20.000 m²) → grande.');
    expect(ehGrande(m({ area_m2: 20_000 }), cfg).grande).toBe(true);
    expect(ehGrande(m({ area_m2: 19_999 }), cfg).grande).toBe(false);
    const p = ehGrande(m({ geometry_kind: 'ponto', area_m2: null }), cfg);
    expect(p.grande).toBe(false);
    expect(p.conta).toContain('só como um ponto');
  });
  it('matriz do critério', () => {
    const casos: [string, Partial<MetricasShopping>, boolean][] = [
      ['area', { area_m2: 30_000, pois_mapped: 0 }, true],
      ['lojas', { area_m2: 30_000, pois_mapped: 49 }, false],
      ['lojas', { area_m2: 1_000, pois_mapped: 50 }, true],
      ['lojas', { pois_mapped: null }, false],
      ['area_ou_lojas', { area_m2: 1_000, pois_mapped: 60 }, true],
      ['area_ou_lojas', { area_m2: 1_000, pois_mapped: 10 }, false],
      ['area_e_lojas', { area_m2: 30_000, pois_mapped: 60 }, true],
      ['area_e_lojas', { area_m2: 30_000, pois_mapped: 10 }, false],
      ['todos', { geometry_kind: 'ponto', area_m2: null, pois_mapped: null }, true],
    ];
    for (const [criterio, over, esperado] of casos) {
      expect([criterio, ehGrande(m(over), { ...cfg, criterio: criterio as typeof cfg.criterio }).grande]).toEqual([criterio, esperado]);
    }
  });
  it('a marcação manual vale mais que o critério, nos dois sentidos', () => {
    const sim = ehGrande(m({ area_m2: 100, large_override: true }), cfg);
    expect(sim).toMatchObject({ grande: true, por: 'manual' });
    expect(sim.conta).toContain('à mão');
    expect(ehGrande(m({ area_m2: 99_000, large_override: false }), cfg)).toMatchObject({ grande: false, por: 'manual' });
  });
  it('configuração: faixa conferida; desconhecida = erro', () => {
    expect(CONFIG_SHOPPING.aplicar(cfg, { area_min_m2: 500 })).toMatchObject({ ok: false });
    expect(CONFIG_SHOPPING.aplicar(cfg, { criterio: 'qualquer' })).toMatchObject({ ok: false });
    expect(CONFIG_SHOPPING.aplicar(cfg, { lojas_min: 30, criterio: 'area_ou_lojas' })).toMatchObject({
      ok: true,
      config: { lojas_min: 30, criterio: 'area_ou_lojas' },
    });
    expect(CONFIG_SHOPPING.aplicar(cfg, { outra: 1 })).toMatchObject({ ok: false, erro: 'outra: campo desconhecido.' });
    expect(CONFIG_SHOPPING.ler({ area_min_m2: 'x', raio_lojas_m: 250 })).toMatchObject({ area_min_m2: 20_000, raio_lojas_m: 250 });
  });
});

describe('consultas montadas no servidor', () => {
  it('shoppings: shop=mall com geometria, raio truncado', () => {
    expect(montarQueryShoppings({ lat: -19.9191, lng: -43.9386 }, 15000.7)).toBe(
      '[out:json][timeout:60];\n(\n  nwr["shop"="mall"](around:15000,-19.9191,-43.9386);\n);\nout geom 500;',
    );
  });
  it('lojas dentro do polígono: map_to_area do way/relation e os segmentos como perfil (mesmas linhas da busca)', () => {
    const bar = SEGMENTOS_PADRAO.filter((s) => s.slug === 'bar');
    expect(montarQueryLojas(bar, { tipo: 'area', source_ref: 'way/123' })).toBe(
      '[out:json][timeout:25];\nway(123);map_to_area->.shop;\n(\n  nwr["amenity"~"^(bar|pub)$"](area.shop);\n);\nout tags center 2000;',
    );
    expect(montarQueryLojas(bar, { tipo: 'area', source_ref: 'relation/9' })).toContain('relation(9);map_to_area->.shop;');
  });
  it('lojas de shopping só como ponto: raio em volta (menos confiável), igual ao seletor da busca', () => {
    const bar = SEGMENTOS_PADRAO.filter((s) => s.slug === 'bar');
    expect(montarQueryLojas(bar, { tipo: 'raio', centro: { lat: -19.9, lng: -43.9 }, raio_m: 300 })).toBe(
      '[out:json][timeout:25];\n(\n  nwr["amenity"~"^(bar|pub)$"](around:300,-19.9,-43.9);\n);\nout tags center 2000;',
    );
  });
  it('referência torta nunca vira QL', () => {
    const bar = SEGMENTOS_PADRAO.filter((s) => s.slug === 'bar');
    expect(() => montarQueryLojas(bar, { tipo: 'area', source_ref: 'way/1);out;(' })).toThrow();
    expect(() => montarQueryLojas(bar, { tipo: 'area', source_ref: 'node/5' })).toThrow();
  });
});

describe('resposta do Overpass → shoppings', () => {
  it('o mesmo shopping mapeado duas vezes (way + relation) fica uma vez, com o polígono; nomes só parecidos ficam os dois', () => {
    const q = quadrado(-19.92, -43.94, 200);
    const r = normalizarShoppings({
      elements: [
        { type: 'relation', id: 1, tags: { shop: 'mall', name: 'Monte Carmo Shopping' }, members: [{ type: 'node', role: 'label' }], bounds: { minlat: -19.92, minlon: -43.94, maxlat: -19.918, maxlon: -43.938 } },
        { type: 'way', id: 2, geometry: comoOsm(q), tags: { shop: 'mall', name: 'Monte Carmo Shopping' } },
        { type: 'way', id: 3, geometry: comoOsm(quadrado(-19.9195, -43.9395, 60)), tags: { shop: 'mall', name: 'Conviva Monte Carmo Shopping' } },
      ],
    });
    expect(r.map((x) => x.lugar.source_ref)).toEqual(['way/2', 'way/3']);
  });

  it('nome obrigatório, categoria "shopping", métricas e endereço; fechado é descartado depois pela regra comum', () => {
    const r = normalizarShoppings({
      elements: [
        { type: 'way', id: 10, geometry: comoOsm(quadrado(-19.92, -43.94, 200)), tags: { shop: 'mall', name: 'Shopping A', 'building:levels': '3', 'addr:street': 'Av. X', 'addr:housenumber': '1' } },
        { type: 'node', id: 11, lat: -19.93, lon: -43.95, tags: { shop: 'mall', name: 'Galeria B' } },
        { type: 'way', id: 12, geometry: comoOsm(quadrado(-19.9, -43.9, 50)), tags: { shop: 'mall' } },
        { type: 'way', id: 13, tags: { shop: 'supermarket', name: 'Não é shopping' } },
      ],
    });
    expect(r.map((x) => [x.lugar.name, x.lugar.source_ref, x.metricas.geometry_kind])).toEqual([
      ['Shopping A', 'way/10', 'poligono'],
      ['Galeria B', 'node/11', 'ponto'],
      ['', 'way/12', 'poligono'],
    ]);
    expect(r[0]!.lugar).toMatchObject({ category: 'shopping', address: 'Av. X, 1', source: 'osm', location_precision: 'point' });
    expect(r[0]!.metricas.levels).toBe(3);
    expect(r[0]!.metricas.area_m2).toBeGreaterThan(39_000);
  });
});

describe('fixture do dry-run em BH (Overpass público, 22/10; recorte sem contato)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fx = require('../../modules/places/__tests__/fixtures/overpass-shoppings-bh.json') as unknown;
  const r = normalizarShoppings(fx);
  const por = (nome: string) => r.filter((s) => s.lugar.name === nome);
  const cfg = CONFIG_SHOPPING.padrao;
  const grande = (nome: string) =>
    ehGrande({ ...por(nome)[0]!.metricas, pois_mapped: null, large_override: null }, cfg).grande;

  it('relation com o contorno partido em 6 ways (Shopping Del Rey) vira polígono com área', () => {
    expect(por('Shopping Del Rey')).toHaveLength(1);
    expect(por('Shopping Del Rey')[0]!.metricas).toMatchObject({ geometry_kind: 'poligono' });
    expect(por('Shopping Del Rey')[0]!.metricas.area_m2).toBeGreaterThan(60_000);
  });
  it('mapeado duas vezes (way + relation): fica um, o de maior área; relation só com nós (rótulos) não vence o way', () => {
    expect(por('ViaShopping Barreiro')).toHaveLength(1);
    expect(por('ViaShopping Barreiro')[0]!.lugar.source_ref).toBe('relation/5706955');
    expect(por('Monte Carmo Shopping').map((s) => s.lugar.source_ref)).toEqual(['way/606700930']);
    expect(por('Partage Shopping Betim').map((s) => s.lugar.source_ref)).toEqual(['way/682953665']);
  });
  it('com o padrão (área ≥ 20.000 m²): BH Shopping e Del Rey grandes; Pátio Savassi e Diamond (verticais) não — o ajuste à mão resolve', () => {
    expect(grande('BH Shopping')).toBe(true);
    expect(grande('Shopping Del Rey')).toBe(true);
    expect(grande('Boulevard Shopping')).toBe(true);
    expect(grande('Pátio Savassi')).toBe(false);
    expect(grande('DiamondMall')).toBe(false);
    expect(por('Serena Shopping')[0]!.metricas.geometry_kind).toBe('ponto');
  });
});
