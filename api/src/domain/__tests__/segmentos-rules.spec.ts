import {
  classificarSegmento,
  hashSegmentos,
  montarQuerySegmentos,
  normalizarOverpassSegmentos,
  seletorRaio,
  SEGMENTOS_PADRAO,
  segmentosDaBusca,
  validarSegmentos,
  type Segmento,
} from '../segmentos-rules';
import { montarQueryOverpass, TIPOS_LUGAR } from '../places-rules';

const CENTRO = { lat: -23.6003, lng: -46.665 };

/**
 * Oráculo: a consulta de HOJE (§22.1), copiada aqui de propósito. Se alguém mexer no `montarQueryOverpass` ou nos filtros
 * padrão, este teste mostra que a consulta dos 5 slugs mudou.
 */
const FILTRO_HOJE: Record<string, string> = {
  bar: '["amenity"~"^(bar|pub)$"]',
  restaurante: '["amenity"="restaurant"]',
  lanchonete: '["amenity"="fast_food"]',
  padaria: '["shop"="bakery"]',
  cafe: '["amenity"="cafe"]',
};
const queryDeHoje = (raio: number, tipos: string[]) =>
  `[out:json][timeout:25];\n(\n${tipos.map((t) => `  nwr${FILTRO_HOJE[t]}(around:${raio},${CENTRO.lat},${CENTRO.lng});`).join('\n')}\n);\nout tags center 2000;`;

const subconjuntos = <T>(xs: readonly T[]): T[][] =>
  xs.reduce<T[][]>((acc, x) => [...acc, ...acc.map((s) => [...s, x])], [[]]).filter((s) => s.length > 0);

const porSlug = (slug: string) => SEGMENTOS_PADRAO.find((s) => s.slug === slug)!;

describe('segmentos — consulta dos 5 slugs de hoje', () => {
  it('qualquer subconjunto dos 5 sai byte a byte igual à consulta de hoje (com os segmentos padrão)', () => {
    for (const tipos of subconjuntos(TIPOS_LUGAR)) {
      const ordenados = [...tipos].sort();
      const segs = ordenados.map(porSlug);
      expect(montarQuerySegmentos(segs, seletorRaio(CENTRO, 1500))).toBe(queryDeHoje(1500, ordenados));
      expect(montarQuerySegmentos(segs, seletorRaio(CENTRO, 1500))).toBe(
        montarQueryOverpass(CENTRO, 1500, ordenados as never),
      );
    }
  });

  it('o raio é truncado como hoje e centro inválido é recusado', () => {
    expect(seletorRaio(CENTRO, 499.9)).toBe('(around:499,-23.6003,-46.665)');
    expect(() => seletorRaio({ lat: Number.NaN, lng: 1 }, 10)).toThrow();
  });

  it('os 10 padrão: 5 de hoje + buffet, pizzaria, hamburgueria, hotel e motel, todos ativos', () => {
    expect(SEGMENTOS_PADRAO.map((s) => s.slug).sort()).toEqual([
      'bar',
      'buffet',
      'cafe',
      'hamburgueria',
      'hotel',
      'lanchonete',
      'motel',
      'padaria',
      'pizzaria',
      'restaurante',
    ]);
    expect(SEGMENTOS_PADRAO.every((s) => s.active)).toBe(true);
    expect(validarSegmentos(SEGMENTOS_PADRAO)).toMatchObject({ ok: true });
  });
});

describe('segmentos — montagem segura', () => {
  it('cuisine (lista com ;) usa o padrão que acha o termo dentro da lista; palavras viram name~ com a chave de base', () => {
    const q = montarQuerySegmentos([porSlug('pizzaria'), porSlug('buffet')], seletorRaio(CENTRO, 800));
    expect(q).toContain(
      '  nwr["amenity"~"^(restaurant|fast_food)$"]["cuisine"~"(^|;) *(pizza) *(;|$)"](around:800,-23.6003,-46.665);',
    );
    expect(q).toContain('  nwr["craft"="caterer"](around:800,-23.6003,-46.665);');
    expect(q).toContain('  nwr["craft"]["name"~"buffet",i](around:800,-23.6003,-46.665);');
    expect(q).toContain('  nwr["amenity"]["name"~"buffet",i](around:800,-23.6003,-46.665);');
  });

  const base: Segmento = {
    slug: 'novo',
    label: 'Novo',
    filters: [[{ key: 'amenity', op: '=', value: 'bar' }]],
    keywords: [],
    priority: 5,
    active: true,
  };
  const com = (over: Partial<Segmento>) => validarSegmentos([...SEGMENTOS_PADRAO, { ...base, ...over }]);

  it.each([
    ['aspas no valor', { filters: [[{ key: 'amenity', op: '=', value: 'bar"];out;' }]] }],
    ['colchete no valor', { filters: [[{ key: 'amenity', op: '=', value: 'bar]' }]] }],
    ['barra invertida', { filters: [[{ key: 'amenity', op: '~', value: 'bar\\|pub' }]] }],
    ['parêntese no ~', { filters: [[{ key: 'amenity', op: '~', value: '(bar)' }]] }],
    ['ponto (regex) no ~', { filters: [[{ key: 'amenity', op: '~', value: 'ba.' }]] }],
    ['chave com aspas', { filters: [[{ key: 'amenity"', op: '=', value: 'bar' }]] }],
    ['chave maiúscula', { filters: [[{ key: 'Amenity', op: '=', value: 'bar' }]] }],
    ['operador desconhecido', { filters: [[{ key: 'amenity', op: '!=', value: 'bar' }]] }],
    ['| no =', { filters: [[{ key: 'amenity', op: '=', value: 'bar|pub' }]] }],
    ['palavra com aspas', { keywords: ['bu"ffet'] }],
    [
      'palavra sem filtro de base',
      { filters: [[{ key: 'cuisine', op: '=', value: 'pizza' }]], keywords: ['pizza'] },
    ],
    ['slug inválido', { slug: 'Novo Slug' }],
    ['grupo vazio', { filters: [[]] }],
    ['termo de apify com aspas', { apify_term: 'x"y' }],
  ])('recusa %s', (_n, over) => {
    expect(com(over as Partial<Segmento>)).toMatchObject({ ok: false });
  });

  it('aceita acento, espaço e _ nos termos; apara espaços; nunca devolve QL do cliente', () => {
    const r = com({
      filters: [
        [
          { key: 'cuisine', op: '~', value: ' açaí | sorvete_italiano ' },
          { key: 'amenity', op: '=', value: 'ice_cream' },
        ],
      ],
      keywords: [' sorveteria '],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const novo = r.segmentos.find((s) => s.slug === 'novo')!;
      expect(novo.filters[0][0].value).toBe('açaí|sorvete_italiano');
      expect(novo.keywords).toEqual(['sorveteria']);
    }
  });

  it('slug repetido, nenhum ativo e slug existente que some são recusados (só desativar)', () => {
    expect(validarSegmentos([...SEGMENTOS_PADRAO, { ...porSlug('bar') }])).toMatchObject({ ok: false });
    expect(validarSegmentos(SEGMENTOS_PADRAO.map((s) => ({ ...s, active: false })))).toMatchObject({
      ok: false,
    });
    const semBar = SEGMENTOS_PADRAO.filter((s) => s.slug !== 'bar');
    const r = validarSegmentos(
      semBar,
      SEGMENTOS_PADRAO.map((s) => s.slug),
    );
    expect(r).toEqual({ ok: false, erro: "segments: o segmento 'bar' não pode ser apagado; desative-o." });
    expect(
      validarSegmentos(
        SEGMENTOS_PADRAO.map((s) => (s.slug === 'bar' ? { ...s, active: false } : s)),
        SEGMENTOS_PADRAO.map((s) => s.slug),
      ),
    ).toMatchObject({ ok: true });
  });

  it('o erro diz o campo', () => {
    const r = com({
      filters: [
        [
          { key: 'amenity', op: '=', value: 'ok' },
          { key: 'amenity', op: '=', value: 'x"' },
        ],
      ],
    });
    expect(r).toMatchObject({
      ok: false,
      erro: expect.stringMatching(/^segments\[10\]\.filters\[0\]\[1\]\.value: /),
    });
  });
});

describe('segmentos — classificação por prioridade', () => {
  const pedidos = segmentosDaBusca(SEGMENTOS_PADRAO, ['restaurante', 'pizzaria', 'buffet', 'bar']);

  it('pizzaria vem antes de restaurante (cuisine em lista com ;)', () => {
    expect(classificarSegmento({ amenity: 'restaurant', cuisine: 'pizza; italian' }, pedidos)).toBe(
      'pizzaria',
    );
    expect(classificarSegmento({ amenity: 'restaurant', cuisine: 'regional' }, pedidos)).toBe('restaurante');
  });

  it('só entre os segmentos DA BUSCA: pedindo só restaurante, a pizzaria é restaurante', () => {
    expect(
      classificarSegmento(
        { amenity: 'restaurant', cuisine: 'pizza' },
        segmentosDaBusca(SEGMENTOS_PADRAO, ['restaurante']),
      ),
    ).toBe('restaurante');
  });

  it('palavra no nome (sem acento/maiúscula) com chave de base; bar|pub; nada casa = null', () => {
    expect(classificarSegmento({ amenity: 'restaurant', name: 'BUFFET da Tia' }, pedidos)).toBe('buffet');
    expect(classificarSegmento({ craft: 'caterer' }, pedidos)).toBe('buffet');
    expect(classificarSegmento({ amenity: 'pub' }, pedidos)).toBe('bar');
    expect(classificarSegmento({ shop: 'bakery' }, pedidos)).toBeNull();
  });

  it('normaliza a resposta do Overpass com a categoria = slug e ignora o que não casa', () => {
    const r = normalizarOverpassSegmentos(
      {
        elements: [
          {
            type: 'node',
            id: 1,
            lat: -23.6,
            lon: -46.66,
            tags: { amenity: 'restaurant', cuisine: 'pizza', name: 'Pizza X' },
          },
          { type: 'node', id: 2, lat: -23.6, lon: -46.66, tags: { shop: 'bakery', name: 'Padoca' } },
          {
            type: 'way',
            id: 3,
            center: { lat: -23.6, lon: -46.66 },
            tags: { amenity: 'bar', name: 'Bar Y', phone: '31 9999-0000;31 8888-0000' },
          },
        ],
      },
      pedidos,
    );
    expect(r.map((l) => [l.source_ref, l.category])).toEqual([
      ['node/1', 'pizzaria'],
      ['way/3', 'bar'],
    ]);
    expect(r[1].phone).toBe('31 9999-0000');
  });
});

describe('segmentos — foto e hash', () => {
  it('a foto tem só os pedidos, na ordem pedida (a consulta de hoje); o hash muda com a definição e não com a ordem', () => {
    const a = segmentosDaBusca(SEGMENTOS_PADRAO, ['bar', 'pizzaria', 'nao_existe']);
    const b = segmentosDaBusca(SEGMENTOS_PADRAO, ['pizzaria', 'bar']);
    expect(a.map((s) => s.slug)).toEqual(['bar', 'pizzaria']);
    expect(hashSegmentos(a)).toBe(hashSegmentos(b));
    const outro = segmentosDaBusca(
      SEGMENTOS_PADRAO.map((s) =>
        s.slug === 'bar' ? { ...s, filters: [[{ key: 'amenity', op: '=' as const, value: 'bar' }]] } : s,
      ),
      ['bar', 'pizzaria'],
    );
    expect(hashSegmentos(outro)).not.toBe(hashSegmentos(a));
  });
});
