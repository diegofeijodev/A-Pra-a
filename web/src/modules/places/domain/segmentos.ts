import type { Segmento } from '../infrastructure/places.api';

/**
 * Segmentos da busca (contrato §36; UX §3.9). Puro: descrição em português dos filtros do mapa aberto, montagem de um segmento
 * novo a partir de categorias em chips (a etiqueta crua fica só em "Avançado") e a ordem da classificação.
 */

/** Categorias do mapa aberto que o admin escolhe em chips (sem texto técnico). */
export const CATEGORIAS_MAPA: { rotulo: string; key: string; value: string }[] = [
  { rotulo: 'Bar', key: 'amenity', value: 'bar' },
  { rotulo: 'Pub', key: 'amenity', value: 'pub' },
  { rotulo: 'Restaurante', key: 'amenity', value: 'restaurant' },
  { rotulo: 'Lanchonete', key: 'amenity', value: 'fast_food' },
  { rotulo: 'Café', key: 'amenity', value: 'cafe' },
  { rotulo: 'Sorveteria', key: 'amenity', value: 'ice_cream' },
  { rotulo: 'Padaria', key: 'shop', value: 'bakery' },
  { rotulo: 'Confeitaria', key: 'shop', value: 'pastry' },
  { rotulo: 'Bufê', key: 'craft', value: 'caterer' },
  { rotulo: 'Hotel', key: 'tourism', value: 'hotel' },
  { rotulo: 'Motel', key: 'tourism', value: 'motel' },
  { rotulo: 'Pousada', key: 'tourism', value: 'guest_house' },
  { rotulo: 'Hostel', key: 'tourism', value: 'hostel' },
];

const rotuloDe = (key: string, value: string): string =>
  CATEGORIAS_MAPA.find((c) => c.key === key && c.value === value)?.rotulo ?? `${key}=${value}`;

/** "Restaurante ou Lanchonete com cozinha pizza" — um grupo; os grupos são "ou". */
export function descreverGrupo(g: Segmento['filters'][number]): string {
  const partes = g.map((f) => {
    const termos = f.value.split('|');
    if (f.key === 'cuisine') return `cozinha ${termos.join(' ou ')}`;
    return termos.map((t) => rotuloDe(f.key, t)).join(' ou ');
  });
  return partes.join(' com ');
}

export function descreverSegmento(s: Pick<Segmento, 'filters' | 'keywords'>): string {
  const grupos = s.filters.map(descreverGrupo);
  if (s.keywords.length) grupos.push(`nome com "${s.keywords.join('" ou "')}"`);
  return grupos.join(' · ou ');
}

/** `Sorveteria Gelato` → `sorveteria_gelato` (único na lista). */
export function slugDoNome(nome: string, existentes: string[]): string {
  const base =
    nome
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 26) || 'segmento';
  const b = base.length < 2 ? `${base}_s` : base;
  let s = b;
  for (let i = 2; existentes.includes(s); i++) s = `${b}_${i}`;
  return s;
}

/** Segmento novo: um grupo por chave de base escolhida (categorias de chaves diferentes são "ou"), mais a cozinha e as palavras. */
export function montarSegmentoNovo(
  p: { nome: string; categorias: { key: string; value: string }[]; cozinha: string; palavras: string },
  existentes: Segmento[],
): Segmento | { erro: string } {
  const nome = p.nome.trim();
  if (!nome) return { erro: 'Dê um nome ao segmento.' };
  const palavras = p.palavras.split(',').map((x) => x.trim()).filter(Boolean);
  if (p.categorias.length === 0) return { erro: 'Escolha ao menos uma categoria do mapa.' };
  const porChave = new Map<string, string[]>();
  for (const c of p.categorias) porChave.set(c.key, [...(porChave.get(c.key) ?? []), c.value]);
  const cozinha = p.cozinha.split(',').map((x) => x.trim()).filter(Boolean);
  const filters = [...porChave.entries()].map(([key, vals]) => [
    { key, op: vals.length > 1 ? ('~' as const) : ('=' as const), value: vals.join('|') },
    ...(cozinha.length ? [{ key: 'cuisine', op: '~' as const, value: cozinha.join('|') }] : []),
  ]);
  const prioridades = existentes.map((s) => s.priority);
  // Com cozinha é específico: vem antes de todos (ex.: pizzaria antes de restaurante); senão, depois de todos.
  const priority = cozinha.length ? Math.max(1, Math.min(...prioridades, 1000) - 1) : Math.min(999, Math.max(0, ...prioridades) + 10);
  return { slug: slugDoNome(nome, existentes.map((s) => s.slug)), label: nome.slice(0, 40), filters, keywords: palavras, priority, active: true, apify_term: null };
}

/** Lista na ordem da classificação (prioridade; empate = ordem da lista). */
export const ordenarPorPrioridade = (lista: Segmento[]): Segmento[] =>
  lista.map((s, i) => ({ s, i })).sort((a, b) => a.s.priority - b.s.priority || a.i - b.i).map((x) => x.s);

/** Sobe/desce uma posição e renumera 10, 20, 30… (o primeiro que casar ganha). */
export function mover(lista: Segmento[], slug: string, delta: -1 | 1): Segmento[] {
  const ord = ordenarPorPrioridade(lista);
  const i = ord.findIndex((s) => s.slug === slug);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= ord.length) return ord;
  [ord[i], ord[j]] = [ord[j]!, ord[i]!];
  return ord.map((s, k) => ({ ...s, priority: (k + 1) * 10 }));
}
