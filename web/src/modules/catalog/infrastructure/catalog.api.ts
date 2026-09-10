import { z } from 'zod';
import { api } from '@/modules/shared/infrastructure/http';

/**
 * `GET /v1/catalog` (§4 do contrato) — conteúdo estático que a API serve de
 * `src/domain/catalog/`. A validação aqui é da BORDA: confere que a forma de
 * cima chegou (as listas são listas, os mapas são mapas) e deixa passar o
 * resto de cada item com `.passthrough()`. Espelhar campo a campo cada uma das
 * ~39 chaves duplicaria o catálogo no web e quebraria a tela a cada campo novo
 * na API — o objetivo é pegar "veio HTML em vez de JSON", não auditar conteúdo.
 */

const stepSchema = z
  .object({ n: z.number(), name: z.string(), block: z.string(), expected: z.string() })
  .passthrough();

const stageSchema = z
  .object({ n: z.number(), name: z.string(), meaning: z.string(), color: z.string() })
  .passthrough();

/** Item de catálogo identificado por `id` + `label` (canais, formatos, modos…). */
const optionSchema = z.object({ id: z.string(), label: z.string() }).passthrough();

const indicatorSchema = z
  .object({ key: z.string(), name: z.string(), meta: z.number(), unit: z.string() })
  .passthrough();

export const catalogSchema = z
  .object({
    steps: z.array(stepSchema),
    gated_by: z.record(z.number()),
    step_blocks: z.array(z.string()),
    funnel_stages: z.array(stageSchema),
    lost_reasons: z.array(z.string()),
    classes: z.array(optionSchema),
    origens: z.array(z.string()),
    import_origens: z.array(z.string()),
    event_labels: z.record(z.string()),
    contact_kinds: z.array(z.string()),
    est_value: z.record(z.number()),
    lead_fields: z.array(z.object({ id: z.string(), label: z.string() }).passthrough()),
    classe_order: z.record(z.number()),
    channels: z.array(optionSchema),
    audiences: z.array(optionSchema),
    send_modes: z.array(optionSchema),
    variables: z.array(z.string()),
    hard_min: z.number(),
    hard_max: z.number(),
    entry_rules: z.array(optionSchema),
    cond_rules: z.array(optionSchema),
    cond_actions: z.array(optionSchema),
    exit_reason_labels: z.record(z.string()),
    objetivos: z.array(optionSchema),
    destinos: z.array(optionSchema),
    formatos: z.array(optionSchema),
    creative_status: z.array(optionSchema),
    campanha_status: z.array(z.string()),
    ia_tools: z.array(z.string()),
    meses: z.array(z.string()),
    script_models: z.array(z.object({ id: z.string(), name: z.string() }).passthrough()),
    proof_kind_labels: z.record(z.string()),
    gate_warning: z.string(),
    fill_alert: z.string(),
    fill_limit_h: z.number(),
    indicators: z.array(indicatorSchema),
    milestones: z.array(z.object({ when: z.string(), label: z.string() }).passthrough()),
    canais: z.array(optionSchema),
    periods: z.array(optionSchema),
  })
  .passthrough();

export type Catalog = z.infer<typeof catalogSchema>;
export type CatalogStep = z.infer<typeof stepSchema>;
export type CatalogStage = z.infer<typeof stageSchema>;
export type CatalogOption = z.infer<typeof optionSchema>;
export type CatalogIndicator = z.infer<typeof indicatorSchema>;

export async function fetchCatalog(): Promise<Catalog> {
  const { data } = await api.get('/v1/catalog');
  return catalogSchema.parse(data);
}
