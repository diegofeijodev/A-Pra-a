/**
 * Filtro "Perfil dos clientes" da rota geral (redesenho E6, arquitetura §4.4; contrato §39.4): lista branca dos perfis, leitura da query,
 * normalização (ordem canônica, sem repetição, vazio = todos), a foto do plano e a conta que explica quem ficou fora.
 */
import {
  contaPerfil,
  lerTiposDaQuery,
  normalizarPerfis,
  perfisConhecidos,
  perfisDaFoto,
  rotuloPerfis,
  semLeadsComPerfil,
} from '../perfil-rota-rules';
import { SEGMENTOS_PADRAO } from '../segmentos-rules';

const bar = { slug: 'bar', label: 'Bar' };
const restaurante = { slug: 'restaurante', label: 'Restaurante' };
const padaria = { slug: 'padaria', label: 'Padaria' };
const DESLIGADA = perfisConhecidos(false, null);

describe('perfisConhecidos (lista branca)', () => {
  it('segmentos desligados: os 5 tipos de hoje com o rótulo no singular, pelo rótulo', () => {
    expect(DESLIGADA).toEqual([
      { slug: 'bar', label: 'Bar' },
      { slug: 'cafe', label: 'Café' },
      { slug: 'lanchonete', label: 'Lanchonete' },
      { slug: 'padaria', label: 'Padaria' },
      { slug: 'restaurante', label: 'Restaurante' },
    ]);
  });

  it('segmentos ligados sem lista salva: os 10 padrão, pelo rótulo (pt-BR)', () => {
    const l = perfisConhecidos(true, null);
    expect(l).toHaveLength(SEGMENTOS_PADRAO.length);
    expect(l.map((p) => p.label)).toEqual(['Bar', 'Buffet', 'Café', 'Hamburgueria', 'Hotel', 'Lanchonete', 'Motel', 'Padaria', 'Pizzaria', 'Restaurante']);
  });

  it('segmentos ligados com a lista salva: valem os dela, INCLUSIVE os desativados (lead achado antes continua filtrável)', () => {
    const salvo = {
      segments: [
        { slug: 'acai', label: 'Açaí', filters: [[{ key: 'shop', op: '=', value: 'ice_cream' }]], keywords: [], priority: 1, active: true },
        { slug: 'bar', label: 'Boteco', filters: [[{ key: 'amenity', op: '~', value: 'bar|pub' }]], keywords: [], priority: 2, active: false },
      ],
    };
    expect(perfisConhecidos(true, salvo)).toEqual([
      { slug: 'acai', label: 'Açaí' },
      { slug: 'bar', label: 'Boteco' },
    ]);
  });

  it('lista salva inválida = os 10 padrão (a mesma regra de lerSegmentos)', () => {
    expect(perfisConhecidos(true, { segments: 'x' })).toHaveLength(10);
  });
});

describe('lerTiposDaQuery', () => {
  it('separa por vírgula, tira espaços e vírgulas vazias', () => {
    expect(lerTiposDaQuery('bar, restaurante,,')).toEqual(['bar', 'restaurante']);
    expect(lerTiposDaQuery(' padaria ')).toEqual(['padaria']);
  });
  it('vazio ou ausente = undefined (todos)', () => {
    expect(lerTiposDaQuery(undefined)).toBeUndefined();
    expect(lerTiposDaQuery('')).toBeUndefined();
    expect(lerTiposDaQuery(' , ,')).toBeUndefined();
  });
});

describe('normalizarPerfis', () => {
  it('ausente, null e [] = todos (null), sem erro', () => {
    expect(normalizarPerfis(undefined, DESLIGADA)).toEqual({ ok: true, perfis: null });
    expect(normalizarPerfis(null, DESLIGADA)).toEqual({ ok: true, perfis: null });
    expect(normalizarPerfis([], DESLIGADA)).toEqual({ ok: true, perfis: null });
  });

  it('sem repetição e na ordem canônica (a da lista branca): o mesmo conjunto dá a mesma foto', () => {
    const a = normalizarPerfis(['restaurante', 'bar', 'restaurante'], DESLIGADA);
    const b = normalizarPerfis(['bar', 'restaurante'], DESLIGADA);
    expect(a).toEqual({ ok: true, perfis: [bar, restaurante] });
    expect(a).toEqual(b);
  });

  it('slug fora da lista branca = mensagem exata', () => {
    expect(normalizarPerfis(['bar', 'pizzaria'], DESLIGADA)).toEqual({ ok: false, erro: "types: 'pizzaria' não é um perfil de cliente." });
  });

  it('formato inválido também não é perfil (e o texto ecoado é cortado em 30)', () => {
    expect(normalizarPerfis(['Bar'], DESLIGADA)).toEqual({ ok: false, erro: "types: 'Bar' não é um perfil de cliente." });
    const longo = 'x'.repeat(50);
    expect(normalizarPerfis([longo], DESLIGADA)).toEqual({ ok: false, erro: `types: '${'x'.repeat(30)}' não é um perfil de cliente.` });
  });

  it('mais de 40 = erro', () => {
    const muitos = Array.from({ length: 41 }, () => 'bar');
    expect(normalizarPerfis(muitos, DESLIGADA)).toEqual({ ok: false, erro: 'types: no máximo 40 perfis.' });
  });

  it('com os segmentos ligados, um desativado é conhecido', () => {
    const salvo = { segments: [{ slug: 'bar', label: 'Bar', filters: [[{ key: 'amenity', op: '=', value: 'bar' }]], keywords: [], priority: 1, active: false }, { slug: 'cafe', label: 'Café', filters: [[{ key: 'amenity', op: '=', value: 'cafe' }]], keywords: [], priority: 2, active: true }] };
    expect(normalizarPerfis(['bar'], perfisConhecidos(true, salvo))).toEqual({ ok: true, perfis: [bar] });
  });
});

describe('textos', () => {
  it('rótulos: um, dois e vários', () => {
    expect(rotuloPerfis([bar])).toBe('Bar');
    expect(rotuloPerfis([bar, restaurante])).toBe('Bar ou Restaurante');
    expect(rotuloPerfis([bar, padaria, restaurante])).toBe('Bar, Padaria ou Restaurante');
  });

  it('PLAN_NO_LEADS com o perfil', () => {
    expect(semLeadsComPerfil([bar, restaurante])).toBe(
      'Nenhum estabelecimento com o perfil Bar ou Restaurante, com localização exata e fora de roteiro publicado nesta área.',
    );
  });

  it('contaPerfil: parte dos elegíveis, com o porquê dos outros', () => {
    expect(contaPerfil({ n: 38, total: 120, perfis: [bar, restaurante] })).toBe(
      '38 dos 120 estabelecimentos elegíveis têm o perfil Bar ou Restaurante. Os outros 82 são de outro perfil ou não têm perfil (cadastrados à mão, importados ou abertos na visita).',
    );
    expect(contaPerfil({ n: 1, total: 2, perfis: [bar] })).toBe(
      '1 dos 2 estabelecimentos elegíveis tem o perfil Bar. O outro é de outro perfil ou não tem perfil (cadastrado à mão, importado ou aberto na visita).',
    );
    expect(contaPerfil({ n: 1500, total: 2000, perfis: [bar] })).toBe(
      '1.500 dos 2.000 estabelecimentos elegíveis têm o perfil Bar. Os outros 500 são de outro perfil ou não têm perfil (cadastrados à mão, importados ou abertos na visita).',
    );
  });

  it('contaPerfil: todos, nenhum e nenhum elegível', () => {
    expect(contaPerfil({ n: 5, total: 5, perfis: [bar] })).toBe('Todos os 5 estabelecimentos elegíveis têm o perfil Bar.');
    expect(contaPerfil({ n: 1, total: 1, perfis: [bar] })).toBe('O único estabelecimento elegível tem o perfil Bar.');
    expect(contaPerfil({ n: 0, total: 120, perfis: [bar] })).toBe(
      'Os 120 estabelecimentos elegíveis são de outro perfil ou não têm perfil (cadastrados à mão, importados ou abertos na visita).',
    );
    expect(contaPerfil({ n: 0, total: 1, perfis: [bar] })).toBe(
      'O único estabelecimento elegível é de outro perfil ou não tem perfil (cadastrado à mão, importado ou aberto na visita).',
    );
    expect(contaPerfil({ n: 0, total: 0, perfis: [bar] })).toBe('Nenhum estabelecimento elegível nesta área, com ou sem perfil.');
  });
});

describe('perfisDaFoto (params_snapshot do plano)', () => {
  it('lê a lista gravada; qualquer outra forma = null (planos de antes e gerados sem perfil)', () => {
    expect(perfisDaFoto({ por_rota: 20, types: [bar, restaurante] })).toEqual([bar, restaurante]);
    expect(perfisDaFoto({ por_rota: 20 })).toBeNull();
    expect(perfisDaFoto({ types: null })).toBeNull();
    expect(perfisDaFoto({ types: [] })).toBeNull();
    expect(perfisDaFoto({ types: [{ slug: 'bar' }] })).toBeNull();
    expect(perfisDaFoto(null)).toBeNull();
    expect(perfisDaFoto([bar])).toBeNull();
  });
});
