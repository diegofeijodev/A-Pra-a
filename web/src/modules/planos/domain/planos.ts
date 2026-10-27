import { z } from 'zod';
import { routeViewSchema } from '@/modules/rotas/domain/rota.schema';

/**
 * Wire do restante da Lovable, lote D — contrato §39 (divisão de uma área em N rotas, "Minhas rotas") e §40 (shoppings).
 * Os schemas não são `.strict()`: campo aditivo do servidor é seguro.
 */

/** `features` do lote D no `GET settings/config` (§39.1, §40.1). Servidor antigo não manda = desligado. */
export const featuresLoteDSchema = z.object({
  route_plans: z.boolean().default(false),
  malls: z.boolean().default(false),
});
export type FeaturesLoteD = z.infer<typeof featuresLoteDSchema>;

export const configDivisaoSchema = z.object({
  por_rota: z.number(),
  modelo_tempo: z.enum(['lovable', 'roteiro']),
  minutos_por_cliente: z.number(),
  intervalo_min: z.number(),
  limite_min: z.number(),
  travel_mode: z.enum(['carro', 'a_pe']),
  kmh_carro: z.number(),
  kmh_pe: z.number(),
});
export type ConfigDivisao = z.infer<typeof configDivisaoSchema>;

export const previaSchema = z.object({
  lead_count: z.number(),
  /** Os elegíveis sem o filtro de perfil (redesenho E6, §39.5); servidor antigo não manda. */
  lead_count_total: z.number().optional(),
  truncated: z.boolean(),
  por_rota: z.number(),
  rotas_min: z.number(),
  conta: z.string(),
});
export type Previa = z.infer<typeof previaSchema>;

/** Um perfil dos clientes (§39.4): o `slug` do segmento (ou de um dos 5 tipos) e o rótulo. */
export const perfilSchema = z.object({ slug: z.string(), label: z.string() });
export type Perfil = z.infer<typeof perfilSchema>;

const contaSchema = z.object({ minutos: z.number(), texto: z.string() });

export const planItemSchema = z.object({
  id: z.string(),
  seq: z.number(),
  name: z.string(),
  color: z.string(),
  lead_ids: z.array(z.string()),
  distance_m: z.number(),
  est_minutes: z.number(),
  stops: z.array(z.object({ lead_id: z.string(), name: z.string(), address: z.string(), lat: z.number(), lng: z.number() })),
  bairro_principal: z.string().nullable(),
  do_centro_m: z.number().nullable(),
  conta_lovable: contaSchema,
  conta_roteiro: contaSchema.extend({ coube: z.boolean(), fora: z.number() }),
  assigned: z
    .object({
      route_id: z.string().nullable(),
      consultant_id: z.string().nullable(),
      consultant_name: z.string().nullable(),
      day: z.string().nullable(),
      at: z.string().nullable(),
    })
    .nullable(),
});
export type PlanItem = z.infer<typeof planItemSchema>;

export const planSummarySchema = z.object({
  id: z.string(),
  praca_id: z.string(),
  area_id: z.string().nullable(),
  area_name: z.string().nullable(),
  kind: z.enum(['geral', 'shoppings', 'shopping_interno']),
  parent_lead_id: z.string().nullable(),
  travel_mode: z.enum(['carro', 'a_pe']),
  modelo_tempo: z.enum(['lovable', 'roteiro']),
  item_count: z.number(),
  assigned_count: z.number(),
  lead_count: z.number(),
  truncated: z.boolean(),
  created_at: z.string(),
  created_by: z.string(),
  archived_at: z.string().nullable(),
  /** "Perfil dos clientes" da geração (redesenho E6): `null`/ausente = todos (e os planos de antes do E6). */
  types: z.array(perfilSchema).nullish(),
});
export type PlanSummary = z.infer<typeof planSummarySchema>;

export const planViewSchema = planSummarySchema.extend({ items: z.array(planItemSchema) });
export type PlanView = z.infer<typeof planViewSchema>;

export const atribuicaoSchema = z.object({ item: planItemSchema, route: routeViewSchema, dropped: z.number() });
export type Atribuicao = z.infer<typeof atribuicaoSchema>;

/** `GET /v1/campo/routes` (§39.7). */
export const minhasRotasSchema = z.object({
  from: z.string(),
  to: z.string(),
  routes: z.array(
    routeViewSchema.extend({
      route_plan: z.object({ plan_id: z.string(), item_id: z.string(), name: z.string(), color: z.string() }).nullable().optional(),
    }),
  ),
});
export type MinhasRotas = z.infer<typeof minhasRotasSchema>;
export type MinhaRota = MinhasRotas['routes'][number];

// ── shoppings (§40) ──

export const configShoppingSchema = z.object({
  criterio: z.enum(['area', 'lojas', 'area_ou_lojas', 'area_e_lojas', 'todos']),
  area_min_m2: z.number(),
  lojas_min: z.number(),
  raio_lojas_m: z.number(),
  fora_da_rota_geral: z.boolean(),
});
export type ConfigShopping = z.infer<typeof configShoppingSchema>;

export const shoppingSchema = z.object({
  lead_id: z.string(),
  name: z.string(),
  address: z.string(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  source_ref: z.string().nullable(),
  geometry_kind: z.string(),
  area_m2: z.number().nullable(),
  levels: z.number().nullable(),
  pois_mapped: z.number().nullable(),
  large_override: z.boolean().nullable(),
  is_large: z.boolean(),
  por: z.enum(['manual', 'criterio']),
  conta: z.string(),
  stores: z.number(),
  measured_at: z.string().nullable(),
});
export type Shopping = z.infer<typeof shoppingSchema>;
export const listaShoppingsSchema = z.object({ config: configShoppingSchema, shoppings: z.array(shoppingSchema) });

/** Busca de shoppings/lojas (§40.3): o `SearchRunView` pode vir sem área. */
export const buscaShoppingSchema = z.object({
  id: z.string(),
  status: z.string(),
  kind: z.string().optional(),
  parent_lead_id: z.string().nullable().optional(),
  found: z.number(),
  novos: z.number(),
  duplicados: z.number(),
  descartados: z.number(),
  truncated: z.boolean(),
  error: z.string().nullable(),
});
export type BuscaShopping = z.infer<typeof buscaShoppingSchema>;

export const candidatoShoppingSchema = z.object({
  id: z.string(),
  name: z.string(),
  address: z.string(),
  status: z.string(),
  reason: z.string().nullable(),
  lead_name: z.string().nullable(),
  selectable: z.boolean(),
  distance_m: z.number(),
  metrics: z.object({ geometry_kind: z.string(), area_m2: z.number().nullable(), levels: z.number().nullable() }).partial().optional(),
});
export type CandidatoShopping = z.infer<typeof candidatoShoppingSchema>;

// ── perfil dos clientes (redesenho E6, arquitetura §4.7; Lovable `rotas.tsx`: "Nenhum selecionado = todos os clientes") ──

/**
 * Sem os segmentos editáveis: os 5 tipos de hoje com o rótulo no SINGULAR, os mesmos que a API grava na foto do plano (§39.4) — a pílula
 * e o "Perfil: Bar" da geração dizem a mesma coisa (o `TIPOS` da busca está no plural).
 */
export const PERFIS_SEM_SEGMENTOS: readonly Perfil[] = [
  { slug: 'bar', label: 'Bar' },
  { slug: 'cafe', label: 'Café' },
  { slug: 'lanchonete', label: 'Lanchonete' },
  { slug: 'padaria', label: 'Padaria' },
  { slug: 'restaurante', label: 'Restaurante' },
];

/** Pílulas: os segmentos ATIVOS pelo rótulo (a Lovable ordena por nome); sem a lista (flag desligada), os 5 de hoje. */
export function opcoesDePerfil(segmentos: { slug: string; label: string; active: boolean }[] | null | undefined): Perfil[] {
  if (!segmentos) return [...PERFIS_SEM_SEGMENTOS];
  return segmentos
    .filter((s) => s.active)
    .map((s) => ({ slug: s.slug, label: s.label }))
    .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
}

/** Marca ou desmarca uma pílula. */
export const alternarPerfil = (selecionados: readonly string[], slug: string): string[] =>
  selecionados.includes(slug) ? selecionados.filter((s) => s !== slug) : [...selecionados, slug];

/**
 * O que vai para a API: só os marcados que ainda são opções, na ordem das opções (a mesma ordem pelo rótulo da API), sem repetição — o
 * mesmo conjunto dá a mesma chave de cache da prévia, em qualquer ordem de clique.
 */
export const tiposParaEnviar = (selecionados: readonly string[], opcoes: readonly Perfil[]): string[] =>
  opcoes.filter((o) => selecionados.includes(o.slug)).map((o) => o.slug);

/** Chave da prévia (`usePrevia`): os `types` entram já canônicos. */
export const chavePrevia = (p: { praca_id?: string; area_id?: string; por_rota?: number; types?: readonly string[] }) =>
  ['planos', 'previa', p.praca_id, p.area_id ?? '', p.por_rota ?? 0, (p.types ?? []).join(',')] as const;

/** "Perfil: Bar, Restaurante" ou "Todos os perfis" (a geração salva diz com que filtro foi feita). */
export function textoPerfil(types: readonly Pick<Perfil, 'label'>[] | null | undefined): string {
  return types?.length ? `Perfil: ${types.map((t) => t.label).join(', ')}` : 'Todos os perfis';
}

// ── textos (regra "todo número diz o que é e a conta") ──

const n = (x: number) => x.toLocaleString('pt-BR');
export const km = (m: number) => (m / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 });

export function formatarDuracao(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h ? `${h}h${m ? String(m).padStart(2, '0') : ''}` : `${m} min`;
}

/** "qui 22/10" a partir de `YYYY-MM-DD` (dia de Brasília, sem fuso). */
export function diaCurto(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const sem = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay()];
  return `${sem} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}

/** Rótulo da geração salva: "22/10 14h10 · a pé · 14 rotas · 3 publicadas". */
export function rotuloGeracao(p: PlanSummary): string {
  const d = new Date(p.created_at);
  const quando = d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }).replace(', ', ' ').replace(':', 'h');
  const modo = p.travel_mode === 'a_pe' ? 'a pé' : 'carro/moto';
  return `${quando} · ${modo} · ${n(p.item_count)} ${p.item_count === 1 ? 'rota' : 'rotas'}${p.assigned_count ? ` · ${n(p.assigned_count)} ${p.assigned_count === 1 ? 'publicada' : 'publicadas'}` : ''}`;
}

/** Texto do toast da publicação (UX §3.4). */
export const textoPublicada = (item: string, consultor: string, day: string) =>
  `${item} publicada para ${consultor} em ${diaCurto(day)}. Ela vê na tela Hoje nesse dia.`;

/** Texto do ⓘ do critério de shopping grande (descreve o PADRÃO real, área; o dry-run de BH está no progresso). */
export function textoCriterio(c: ConfigShopping): string {
  const area = `pelo menos ${n(c.area_min_m2)} m² de área no mapa aberto (OpenStreetMap)`;
  const lojas = `pelo menos ${n(c.lojas_min)} lojas mapeadas dentro`;
  const qual =
    c.criterio === 'area'
      ? area
      : c.criterio === 'lojas'
        ? lojas
        : c.criterio === 'area_ou_lojas'
          ? `${area} ou ${lojas}`
          : c.criterio === 'area_e_lojas'
            ? `${area} e ${lojas}`
            : 'todo shopping conta';
  return `Shopping grande = ${qual}. A Lovable usava 2.500 avaliações no Google (≈ 50 lojas); aqui medimos a área do prédio no mapa aberto, porque ele quase não tem as lojas de dentro. Shopping de vários andares pode ter área pequena: marque à mão, a marcação vale mais que o critério.`;
}

/** Dias do mês (calendário "Próximos dias"): semanas de domingo a sábado, com `null` fora do mês. */
export function semanasDoMes(ano: number, mes1a12: number): (string | null)[][] {
  const primeiro = new Date(Date.UTC(ano, mes1a12 - 1, 1)).getUTCDay();
  const dias = new Date(Date.UTC(ano, mes1a12, 0)).getUTCDate();
  const cel: (string | null)[] = [...Array(primeiro).fill(null)];
  for (let d = 1; d <= dias; d += 1) cel.push(`${ano}-${String(mes1a12).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  while (cel.length % 7) cel.push(null);
  const semanas: (string | null)[][] = [];
  for (let i = 0; i < cel.length; i += 7) semanas.push(cel.slice(i, i + 7));
  return semanas;
}
