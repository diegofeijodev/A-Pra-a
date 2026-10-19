import {
  acharLeadDuplicado,
  cacheValido,
  chaveCache,
  classificarAchados,
  estimarCustoApifyUsd,
  limiteApify,
  mesDeBrasilia,
  montarQueryOverpass,
  normalizarApify,
  normalizarOverpass,
  MAX_RESULTADOS,
  type LeadParaDedup,
  type LugarNormalizado,
} from '../places-rules';

const CENTRO = { lat: -23.6003, lng: -46.665 };

const lugar = (over: Partial<LugarNormalizado> = {}): LugarNormalizado => ({
  name: 'Bar do Chico',
  category: 'bar',
  address: 'Av. Ibirapuera, 88',
  lat: -23.6003,
  lng: -46.665,
  location_precision: 'point',
  phone: '',
  website: null,
  source: 'osm',
  source_ref: 'node/1',
  closed: false,
  ...over,
});

describe('montarQueryOverpass', () => {
  it('usa around com raio e centro, só os tipos pedidos e o teto de elementos', () => {
    const q = montarQueryOverpass(CENTRO, 500, ['bar', 'padaria']);
    expect(q).toContain('[out:json]');
    expect(q).toContain('nwr["amenity"~"^(bar|pub)$"](around:500,-23.6003,-46.665)');
    expect(q).toContain('nwr["shop"="bakery"](around:500,-23.6003,-46.665)');
    expect(q).not.toContain('restaurant');
    expect(q).toContain('out tags center 2000;');
  });

  it('todos os tipos cobrem bar|pub, restaurant, fast_food, cafe e bakery', () => {
    const q = montarQueryOverpass(CENTRO, 1000, ['bar', 'restaurante', 'lanchonete', 'padaria', 'cafe']);
    for (const t of ['bar|pub', 'restaurant', 'fast_food', 'cafe', 'bakery']) expect(q).toContain(t);
  });

  it('raio vira inteiro (sem injeção por número)', () => {
    expect(montarQueryOverpass(CENTRO, 500.9, ['bar'])).toContain('around:500,');
  });
});

describe('normalizarOverpass', () => {
  it('nó com tags: nome, endereço, telefone (primeiro de vários), site, ref e categoria', () => {
    const [p] = normalizarOverpass({
      elements: [
        {
          type: 'node',
          id: 42,
          lat: -23.6,
          lon: -46.66,
          tags: {
            name: 'Padaria Bom Pão',
            shop: 'bakery',
            'addr:street': 'Rua Gaivota',
            'addr:housenumber': '120',
            'addr:suburb': 'Moema',
            phone: '+55 11 3333-4444; +55 11 99999-0000',
            'contact:website': 'https://bompao.example',
          },
        },
      ],
    });
    expect(p).toMatchObject({
      name: 'Padaria Bom Pão',
      category: 'padaria',
      address: 'Rua Gaivota, 120 - Moema',
      lat: -23.6,
      lng: -46.66,
      location_precision: 'point',
      phone: '+55 11 3333-4444',
      website: 'https://bompao.example',
      source: 'osm',
      source_ref: 'node/42',
      closed: false,
    });
  });

  it('way usa o centro; sem coordenada é descartado; pub vira bar', () => {
    const r = normalizarOverpass({
      elements: [
        { type: 'way', id: 7, center: { lat: -23.61, lon: -46.67 }, tags: { name: 'Pub X', amenity: 'pub' } },
        { type: 'relation', id: 8, tags: { name: 'Sem ponto', amenity: 'bar' } },
      ],
    });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ source_ref: 'way/7', category: 'bar', lat: -23.61, lng: -46.67 });
  });

  it('marca fechado: disused:*, abandoned:* e opening_hours=off', () => {
    const mk = (id: number, tags: Record<string, string>) => ({
      type: 'node',
      id,
      lat: -23.6,
      lon: -46.66,
      tags: { name: 'N' + id, amenity: 'bar', ...tags },
    });
    const r = normalizarOverpass({
      elements: [mk(1, { 'disused:amenity': 'bar' }), mk(2, { 'abandoned:shop': 'yes' }), mk(3, { opening_hours: 'off' }), mk(4, {})],
    });
    expect(r.map((p) => p.closed)).toEqual([true, true, true, false]);
  });

  it('sem nome devolve name vazio (a classificação descarta); resposta torta não explode', () => {
    expect(normalizarOverpass({ elements: [{ type: 'node', id: 1, lat: -23.6, lon: -46.6, tags: { amenity: 'bar' } }] })[0]!.name).toBe('');
    expect(normalizarOverpass(null)).toEqual([]);
    expect(normalizarOverpass({})).toEqual([]);
    expect(normalizarOverpass({ elements: [{ type: 'node' }] })).toEqual([]);
  });
});

describe('normalizarApify', () => {
  it('mapeia título, endereço, telefone, site, localização e placeId', () => {
    const [p] = normalizarApify([
      {
        title: 'Café Ipê',
        address: 'Al. dos Anapurus, 7, Moema',
        phone: '(11) 2222-3333',
        website: 'https://ipe.example',
        location: { lat: -23.6, lng: -46.66 },
        placeId: 'ChIJabc',
        categoryName: 'Cafeteria',
        permanentlyClosed: false,
      },
    ]);
    expect(p).toMatchObject({
      name: 'Café Ipê',
      category: 'cafe',
      address: 'Al. dos Anapurus, 7, Moema',
      phone: '(11) 2222-3333',
      website: 'https://ipe.example',
      source: 'apify',
      source_ref: 'ChIJabc',
      closed: false,
      location_precision: 'point',
    });
  });

  it('fechado (definitivo ou temporário) e item sem local/ref são tratados', () => {
    const r = normalizarApify([
      { title: 'A', location: { lat: -23.6, lng: -46.6 }, placeId: 'a', permanentlyClosed: true },
      { title: 'B', location: { lat: -23.6, lng: -46.6 }, placeId: 'b', temporarilyClosed: true },
      { title: 'C', placeId: 'c' },
      { title: 'D', location: { lat: -23.6, lng: -46.6 } },
    ]);
    expect(r.map((p) => [p.source_ref, p.closed])).toEqual([['a', true], ['b', true]]);
  });

  it('categoria: padaria, lanchonete, bar e padrão restaurante', () => {
    const cat = (categoryName: string) =>
      normalizarApify([{ title: 'x', placeId: categoryName, location: { lat: -23.6, lng: -46.6 }, categoryName }])[0]!.category;
    expect(cat('Padaria')).toBe('padaria');
    expect(cat('Lanchonete')).toBe('lanchonete');
    expect(cat('Bar e grill')).toBe('bar');
    expect(cat('Churrascaria')).toBe('restaurante');
  });
});

describe('classificarAchados', () => {
  it('ordena por distância, descarta fechado e sem nome, tira o que está fora do círculo', () => {
    const r = classificarAchados(
      [
        lugar({ source_ref: 'node/3', name: 'Longe', lat: -23.6043, lng: -46.665 }), // ~445 m
        lugar({ source_ref: 'node/1', name: 'Perto', lat: -23.6008 }),
        lugar({ source_ref: 'node/2', name: 'Fechado', lat: -23.6012, closed: true }),
        lugar({ source_ref: 'node/4', name: '', lat: -23.6015 }),
        lugar({ source_ref: 'node/5', name: 'Fora do raio', lat: -23.62 }),
      ],
      CENTRO,
      500,
    );
    expect(r.achados.map((a) => [a.lugar.source_ref, a.status, a.reason])).toEqual([
      ['node/1', 'novo', null],
      ['node/2', 'descartado', 'parece_fechado'],
      ['node/4', 'descartado', 'sem_nome'],
      ['node/3', 'novo', null],
    ]);
    expect(r.achados[0]!.distance_m).toBeLessThan(r.achados[3]!.distance_m);
    expect(r.truncated).toBe(false);
  });

  it('repetido na busca: mesmo source_ref, ou nome parecido a ≤ 100 m (fica o mais perto do centro)', () => {
    const r = classificarAchados(
      [
        lugar({ source_ref: 'node/1', name: 'Bar do Chico', lat: -23.6004 }),
        lugar({ source_ref: 'way/9', name: 'Chico Bar do', lat: -23.6008 }),
        lugar({ source_ref: 'node/1', name: 'Bar do Chico', lat: -23.6004 }),
        lugar({ source_ref: 'node/7', name: 'Bar do Chico', lat: -23.608 }), // outro Chico, longe (~800 m)
      ],
      CENTRO,
      2000,
    );
    expect(r.achados.map((a) => [a.lugar.source_ref, a.status, a.reason])).toEqual([
      ['node/1', 'novo', null],
      ['node/1', 'duplicado', 'repetido_na_busca'],
      ['way/9', 'duplicado', 'repetido_na_busca'],
      ['node/7', 'novo', null],
    ]);
  });

  it(`corta em ${MAX_RESULTADOS} mais próximos e avisa truncated`, () => {
    const muitos = Array.from({ length: MAX_RESULTADOS + 20 }, (_, i) =>
      lugar({ source_ref: `node/${i}`, name: `Lugar único ${i} ${'x'.repeat(i % 7)}${i}`, lat: -23.6003 + i * 0.00002 }),
    );
    const r = classificarAchados(muitos, CENTRO, 5000);
    expect(r.achados).toHaveLength(MAX_RESULTADOS);
    expect(r.truncated).toBe(true);
    expect(r.achados[0]!.lugar.source_ref).toBe('node/0');
  });
});

describe('acharLeadDuplicado', () => {
  const lead = (over: Partial<LeadParaDedup> = {}): LeadParaDedup => ({
    id: 'L1',
    name: 'Outro Nome Qualquer',
    address: '',
    phone: '',
    lat: null,
    lng: null,
    source: null,
    source_ref: null,
    ...over,
  });

  it('mesmo source_ref', () => {
    const r = acharLeadDuplicado(lugar(), [lead({ source: 'osm', source_ref: 'node/1' })]);
    expect(r?.por).toBe('source_ref');
  });
  it('mesmo telefone (últimos 9 dígitos, ignora máscara e DDI)', () => {
    const r = acharLeadDuplicado(lugar({ phone: '+55 (11) 3333-4444' }), [lead({ phone: '11 3333 4444' })]);
    expect(r?.por).toBe('telefone');
  });
  it('telefone curto nunca casa', () => {
    expect(acharLeadDuplicado(lugar({ phone: '1234' }), [lead({ phone: '1234' })])).toBeNull();
  });
  it('nome + endereço iguais (sem acento/caixa)', () => {
    const r = acharLeadDuplicado(lugar({ name: 'Bar do Chico', address: 'Av. Ibirapuera, 88' }), [
      lead({ name: 'BAR DO CHICO', address: 'av ibirapuera 88' }),
    ]);
    expect(r?.por).toBe('nome+endereço');
  });
  it('nome parecido a 100 m ou menos', () => {
    const perto = lead({ name: 'Bar do Chico Moema', lat: -23.6008, lng: -46.665 }); // ~55 m
    expect(acharLeadDuplicado(lugar(), [perto])?.por).toBe('nome+proximidade');
  });
  it('nome parecido a mais de 100 m não é duplicata; sem coordenada também não', () => {
    const longe = lead({ name: 'Bar do Chico Moema', lat: -23.602, lng: -46.665 }); // ~190 m
    expect(acharLeadDuplicado(lugar(), [longe])).toBeNull();
    expect(acharLeadDuplicado(lugar(), [lead({ name: 'Bar do Chico Moema' })])).toBeNull();
  });
  it('nada em comum => null', () => {
    expect(acharLeadDuplicado(lugar(), [lead({ lat: -23.6003, lng: -46.665 })])).toBeNull();
  });
});

describe('cache', () => {
  const base = { lat: -23.6003, lng: -46.665, radius_m: 1500, types: ['bar', 'cafe'], source: 'osm' };
  it('chave independe da ordem dos tipos e muda com geometria, tipos ou fonte', () => {
    const k = chaveCache(base);
    expect(chaveCache({ ...base, types: ['cafe', 'bar'] })).toBe(k);
    expect(chaveCache({ ...base, radius_m: 1501 })).not.toBe(k);
    expect(chaveCache({ ...base, lat: -23.6004 })).not.toBe(k);
    expect(chaveCache({ ...base, types: ['bar'] })).not.toBe(k);
    expect(chaveCache({ ...base, source: 'apify' })).not.toBe(k);
  });
  it('vale por 7 dias exatos', () => {
    const fim = new Date('2026-10-19T12:00:00Z');
    expect(cacheValido(fim, new Date('2026-10-26T11:59:59Z'))).toBe(true);
    expect(cacheValido(fim, new Date('2026-10-26T12:00:00Z'))).toBe(false);
    expect(cacheValido(null, fim)).toBe(false);
  });
});

describe('teto do Apify', () => {
  it('limite = menor entre o teto por busca e o que sobra no mês', () => {
    expect(limiteApify({ porBusca: 300, tetoMensal: 3000, usadoNoMes: 0 })).toBe(300);
    expect(limiteApify({ porBusca: 300, tetoMensal: 3000, usadoNoMes: 2900 })).toBe(100);
    expect(limiteApify({ porBusca: 300, tetoMensal: 3000, usadoNoMes: 3000 })).toBe(0);
    expect(limiteApify({ porBusca: 300, tetoMensal: 3000, usadoNoMes: 3500 })).toBe(0);
  });
  it('estimativa de custo em dólar (conservadora) e zero para zero', () => {
    expect(estimarCustoApifyUsd(0)).toBe(0);
    expect(estimarCustoApifyUsd(1000)).toBe(7);
    expect(estimarCustoApifyUsd(300)).toBe(2.1);
  });
  it('mês de Brasília: 31/10 22h (BRT) já é 01/11 UTC mas continua outubro', () => {
    expect(mesDeBrasilia(new Date('2026-11-01T01:30:00Z'))).toBe('2026-10');
    expect(mesDeBrasilia(new Date('2026-11-01T03:00:00Z'))).toBe('2026-11');
  });
});
