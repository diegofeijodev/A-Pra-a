/**
 * Checklist de abordagem da visita (restante da Lovable, fase L3; contrato §35) — regras PURAS.
 *
 * Lovable: `configuracoes.checklist_visita` (7 etapas semeadas em `0000_migration.sql:130`), fotografadas no check-in como
 * `{item, feito:false, obs:''}` (`roteiro.$rotaId.tsx:180`) e gravadas no finalizar; `pendenciasFinalizar` NÃO confere o
 * checklist (`src/lib/visita.ts:35-46`). Aqui a obrigatoriedade é configurável e lida SEMPRE da foto do check-in.
 */
import { grupoConfig } from './config-grupo';
import { FLUXOS_VISITA, type FluxoVisita } from './modo-campo-rules';

export interface ItemChecklist {
  id: string;
  text: string;
}

/** As 7 etapas da Lovable, palavra por palavra, com "voucher" → "cupom" (UX §3.5, critério G4). */
export const ETAPAS_PADRAO: ItemChecklist[] = [
  { id: 'apresentacao', text: 'Apresentação pessoal e da empresa' },
  { id: 'entender_negocio', text: 'Entender o negócio do cliente' },
  { id: 'identificar_necessidade', text: 'Identificar a necessidade' },
  { id: 'apresentar_solucao', text: 'Apresentar a solução e os benefícios' },
  { id: 'oferecer_cupom', text: 'Oferecer o cupom da 1ª contratação grátis' },
  { id: 'tratar_objecoes', text: 'Tratar objeções' },
  { id: 'fechamento', text: 'Fechamento: cadastro ou próximo passo' },
];

export const OBRIGATORIEDADES_CHECKLIST = ['nao', 'todas'] as const;
export type ObrigatoriedadeChecklist = (typeof OBRIGATORIEDADES_CHECKLIST)[number];
export const ID_ETAPA_RE = /^[a-z0-9_]{1,40}$/;
export const MAX_ETAPAS = 20;
export const MAX_TEXTO_ETAPA = 120;
export const MAX_NOTA_ETAPA = 200;

export interface ConfigChecklist {
  checklist_items: ItemChecklist[];
  checklist_obrigatorio: ObrigatoriedadeChecklist;
  checklist_fluxos: FluxoVisita[];
  /** Só da tela: a lista começa aberta (UX §3.5). */
  checklist_aberto: boolean;
}

const ehItem = (x: unknown): x is ItemChecklist => {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return false;
  const o = x as Record<string, unknown>;
  if (Object.keys(o).some((k) => k !== 'id' && k !== 'text')) return false;
  return (
    typeof o.id === 'string' &&
    ID_ETAPA_RE.test(o.id) &&
    typeof o.text === 'string' &&
    o.text === o.text.trim() &&
    o.text.length >= 1 &&
    o.text.length <= MAX_TEXTO_ETAPA
  );
};
const itensValidos = (v: unknown): boolean =>
  Array.isArray(v) &&
  v.length >= 1 &&
  v.length <= MAX_ETAPAS &&
  v.every(ehItem) &&
  new Set((v as ItemChecklist[]).map((i) => i.id)).size === v.length;
const fluxosValidos = (v: unknown): boolean =>
  Array.isArray(v) &&
  v.every((x) => (FLUXOS_VISITA as readonly unknown[]).includes(x)) &&
  new Set(v).size === v.length;

export const CONFIG_CHECKLIST = grupoConfig<ConfigChecklist>(
  {
    checklist_items: ETAPAS_PADRAO,
    checklist_obrigatorio: 'nao',
    checklist_fluxos: ['simples', 'completo'],
    checklist_aberto: true,
  },
  {
    checklist_items: itensValidos,
    checklist_obrigatorio: (v) => (OBRIGATORIEDADES_CHECKLIST as readonly unknown[]).includes(v),
    checklist_fluxos: fluxosValidos,
    checklist_aberto: (v) => typeof v === 'boolean',
  },
);

/**
 * PUT de `checklist_items`: apara o texto e dá `id` às etapas novas (o `id` é do servidor e nunca muda depois). Erro com o campo,
 * como os demais grupos (`checklist_items: …`).
 */
export function prepararItensChecklist(
  raw: unknown,
  gerarId: () => string,
): { ok: true; itens: ItemChecklist[] } | { ok: false; erro: string } {
  const falha = (m: string) => ({ ok: false as const, erro: `checklist_items: ${m}` });
  if (!Array.isArray(raw)) return falha('envie uma lista de etapas.');
  if (raw.length < 1 || raw.length > MAX_ETAPAS) return falha(`de 1 a ${MAX_ETAPAS} etapas.`);
  const itens: ItemChecklist[] = [];
  for (const [i, x] of raw.entries()) {
    if (!x || typeof x !== 'object' || Array.isArray(x)) return falha(`etapa ${i + 1}: use { id, text }.`);
    const o = x as Record<string, unknown>;
    if (Object.keys(o).some((k) => k !== 'id' && k !== 'text')) return falha(`etapa ${i + 1}: use só id e text.`);
    const text = typeof o.text === 'string' ? o.text.trim() : '';
    if (text.length < 1 || text.length > MAX_TEXTO_ETAPA) return falha(`etapa ${i + 1}: texto de 1 a ${MAX_TEXTO_ETAPA} caracteres.`);
    const id = o.id == null ? gerarId() : o.id;
    if (typeof id !== 'string' || !ID_ETAPA_RE.test(id)) return falha(`etapa ${i + 1}: id inválido.`);
    if (itens.some((it) => it.id === id)) return falha(`etapa ${i + 1}: id repetido.`);
    itens.push({ id, text });
  }
  return { ok: true, itens };
}

// ── a foto da visita (field_visits.checklist) ─────────────────

export interface EtapaFoto extends ItemChecklist {
  done: boolean;
  note: string | null;
}
export interface FotoChecklist {
  required: ObrigatoriedadeChecklist;
  items: EtapaFoto[];
}
export interface MarcaChecklist {
  id: string;
  done?: boolean;
  note?: string | null;
}

/** No check-in (flag ligada): a lista e a obrigatoriedade DAQUELE instante, ou `null` se o fluxo não usa checklist. */
export function fotografarChecklist(cfg: ConfigChecklist, fluxo: FluxoVisita): FotoChecklist | null {
  if (!cfg.checklist_fluxos.includes(fluxo)) return null;
  return {
    required: cfg.checklist_obrigatorio,
    items: cfg.checklist_items.map((e) => ({ id: e.id, text: e.text, done: false, note: null })),
  };
}

/** Leitura defensiva da coluna JSON: forma inesperada = sem foto (nunca cobra o que não dá para ler). */
export function lerFotoChecklist(raw: unknown): FotoChecklist | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (!(OBRIGATORIEDADES_CHECKLIST as readonly unknown[]).includes(o.required) || !Array.isArray(o.items)) return null;
  const items: EtapaFoto[] = [];
  for (const x of o.items) {
    const e = (x ?? {}) as Record<string, unknown>;
    if (typeof e.id !== 'string' || typeof e.text !== 'string' || typeof e.done !== 'boolean') return null;
    if (e.note !== null && typeof e.note !== 'string') return null;
    items.push({ id: e.id, text: e.text, done: e.done, note: e.note as string | null });
  }
  return { required: o.required as ObrigatoriedadeChecklist, items };
}

/** Marcas do rascunho sobre a foto: só as etapas citadas mudam; `id` desconhecido é ignorado (lista mais velha no aparelho). */
export function mesclarMarcas(foto: FotoChecklist, marcas: readonly MarcaChecklist[]): FotoChecklist {
  const porId = new Map(marcas.map((m) => [m.id, m]));
  return {
    required: foto.required,
    items: foto.items.map((e) => {
      const m = porId.get(e.id);
      if (!m) return { ...e };
      const nota = m.note === undefined ? e.note : m.note === null ? null : m.note.trim().slice(0, MAX_NOTA_ETAPA) || null;
      return { ...e, done: typeof m.done === 'boolean' ? m.done : e.done, note: nota };
    }),
  };
}

/** O que falta no checkout: só quando a FOTO diz `todas` (posições 1-based na foto). */
export function pendenciasChecklist(foto: FotoChecklist | null): string[] {
  if (!foto || foto.required !== 'todas') return [];
  const faltam = foto.items.map((e, i) => (e.done ? 0 : i + 1)).filter((n) => n > 0);
  if (faltam.length === 0) return [];
  return [`roteiro da visita (${faltam.length === 1 ? 'etapa' : 'etapas'} ${faltam.join(', ')})`];
}

export const viewDoChecklist = (foto: FotoChecklist) => ({
  required: foto.required,
  items: foto.items.map((e) => ({ ...e })),
  done: foto.items.filter((e) => e.done).length,
  total: foto.items.length,
});

/** Linha do evento do CRM: só a contagem, nunca as observações (contrato §35.5). */
export const resumoChecklist = (foto: FotoChecklist): string =>
  `Roteiro da conversa: ${foto.items.filter((e) => e.done).length} de ${foto.items.length} etapas.`;
