import { describe, expect, it } from 'vitest';
import type { Segmento } from '../../infrastructure/places.api';
import { descreverSegmento, montarSegmentoNovo, mover, ordenarPorPrioridade, slugDoNome } from '../segmentos';

const seg = (slug: string, priority: number, over: Partial<Segmento> = {}): Segmento => ({
  slug, label: slug, priority, active: true, keywords: [], apify_term: null, filters: [[{ key: 'amenity', op: '=', value: 'bar' }]], ...over,
});

describe('segmentos da busca — tela (UX §3.9)', () => {
  it('descreve os filtros em português (etiqueta crua só quando não conhece)', () => {
    expect(descreverSegmento({ filters: [[{ key: 'amenity', op: '~', value: 'restaurant|fast_food' }, { key: 'cuisine', op: '~', value: 'pizza' }]], keywords: [] })).toBe(
      'Restaurante ou Lanchonete com cozinha pizza',
    );
    expect(descreverSegmento({ filters: [[{ key: 'craft', op: '=', value: 'caterer' }]], keywords: ['buffet'] })).toBe('Bufê · ou nome com "buffet"');
    expect(descreverSegmento({ filters: [[{ key: 'leisure', op: '=', value: 'park' }]], keywords: [] })).toBe('leisure=park');
  });

  it('segmento novo: um grupo por chave, cozinha em todos, slug único; específico vem antes', () => {
    const lista = [seg('bar', 60), seg('restaurante', 70)];
    const novo = montarSegmentoNovo(
      { nome: 'Açaí & Sorvete', categorias: [{ key: 'amenity', value: 'ice_cream' }, { key: 'amenity', value: 'cafe' }, { key: 'shop', value: 'pastry' }], cozinha: 'acai', palavras: 'açaí, sorvete' },
      lista,
    );
    expect(novo).toMatchObject({
      slug: 'acai_sorvete',
      label: 'Açaí & Sorvete',
      priority: 59,
      keywords: ['açaí', 'sorvete'],
      filters: [
        [{ key: 'amenity', op: '~', value: 'ice_cream|cafe' }, { key: 'cuisine', op: '~', value: 'acai' }],
        [{ key: 'shop', op: '=', value: 'pastry' }, { key: 'cuisine', op: '~', value: 'acai' }],
      ],
    });
    expect(montarSegmentoNovo({ nome: 'Pousada', categorias: [{ key: 'tourism', value: 'guest_house' }], cozinha: '', palavras: '' }, lista)).toMatchObject({ priority: 80 });
    expect(montarSegmentoNovo({ nome: '', categorias: [], cozinha: '', palavras: '' }, lista)).toEqual({ erro: 'Dê um nome ao segmento.' });
    expect(montarSegmentoNovo({ nome: 'X', categorias: [], cozinha: '', palavras: '' }, lista)).toEqual({ erro: 'Escolha ao menos uma categoria do mapa.' });
    expect(slugDoNome('Bar', ['bar', 'bar_2'])).toBe('bar_3');
  });

  it('a ordem da classificação: subir/descer renumera 10, 20, 30…', () => {
    const lista = [seg('a', 10), seg('b', 20), seg('c', 30)];
    expect(mover(lista, 'c', -1).map((s) => [s.slug, s.priority])).toEqual([['a', 10], ['c', 20], ['b', 30]]);
    expect(mover(lista, 'a', -1).map((s) => s.slug)).toEqual(['a', 'b', 'c']);
    expect(ordenarPorPrioridade([seg('x', 50), seg('y', 5)]).map((s) => s.slug)).toEqual(['y', 'x']);
  });
});
