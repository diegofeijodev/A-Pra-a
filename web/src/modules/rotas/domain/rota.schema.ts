import { z } from 'zod';

/** `StopView` / `RouteView` do contrato §23, validados na borda da rede. */
export const stopViewSchema = z.object({
  id: z.string(),
  route_id: z.string(),
  lead_id: z.string(),
  seq: z.number(),
  kind: z.enum(['planejada', 'reserva']),
  status: z.enum(['pendente', 'visitada', 'pulada', 'adiada', 'descartada']),
  fixa: z.boolean(),
  eta: z.string().nullable(),
  eta_min: z.number().nullable(),
  planned_minutes: z.number(),
  distance_m: z.number(),
  name: z.string(),
  address: z.string(),
  phone: z.string(),
  lat: z.number(),
  lng: z.number(),
  skip_reason: z.string().nullable(),
  skip_note: z.string().nullable(),
  deferred_to: z.enum(['tarde', 'amanha']).nullable(),
  visit_id: z.string().nullable(),
});
export type StopView = z.infer<typeof stopViewSchema>;

export const configRotaSchema = z.object({
  meta_diaria: z.number(),
  janela_inicio: z.string(),
  janela_fim: z.string(),
  almoco_inicio: z.string(),
  almoco_fim: z.string(),
  minutos_por_visita: z.number(),
  velocidade_kmh: z.number(),
  fator_desvio: z.number(),
  pool_fator: z.number(),
  dias_sem_revisitar: z.number(),
  estagio_maximo_rota: z.number(),
  gerar_ao_iniciar: z.boolean(),
  consultor_pode_gerar: z.boolean(),
});
export type ConfigRota = z.infer<typeof configRotaSchema>;

export const configRotaViewSchema = configRotaSchema.extend({
  atualizado_por: z.string().nullable(),
  atualizado_em: z.string().nullable(),
});
export type ConfigRotaView = z.infer<typeof configRotaViewSchema>;

export const routeViewSchema = z.object({
  id: z.string(),
  consultant_id: z.string(),
  consultant_name: z.string(),
  praca_id: z.string(),
  day: z.string(),
  status: z.string(),
  version: z.number(),
  source: z.enum(['equipe', 'auto', 'consultor']),
  area_id: z.string().nullable(),
  start: z.object({ lat: z.number(), lng: z.number() }),
  params: configRotaSchema,
  stops: z.array(stopViewSchema),
  plan: z.object({ planned: z.number(), reserve: z.number(), walk_km: z.number(), fits_meta: z.boolean(), not_fit: z.number() }),
  progress: z.object({
    meta: z.number(),
    done: z.number(),
    skipped: z.number(),
    deferred: z.number(),
    pending: z.number(),
    expected_now: z.number(),
    delta: z.number(),
  }),
  generated_at: z.string(),
  updated_at: z.string(),
});
export type RouteView = z.infer<typeof routeViewSchema>;

export const hojeRotaSchema = z.object({ enabled: z.boolean(), route: routeViewSchema.nullable(), can_generate: z.boolean() });
export type HojeRotaView = z.infer<typeof hojeRotaSchema>;

export const candidateViewSchema = z.object({
  id: z.string(),
  name: z.string(),
  address: z.string(),
  lat: z.number(),
  lng: z.number(),
  stage: z.number(),
  source: z.string().nullable(),
  category: z.string().nullable(),
  in_area: z.boolean(),
});
export type CandidateView = z.infer<typeof candidateViewSchema>;

export const MOTIVOS_PULO = [
  { id: 'fechado', rotulo: 'Fechado' },
  { id: 'sem_dono', rotulo: 'Sem dono aqui' },
  { id: 'ja_cliente', rotulo: 'Já é cliente' },
  { id: 'outro', rotulo: 'Outro motivo' },
] as const;
export type MotivoPulo = (typeof MOTIVOS_PULO)[number]['id'];
export const rotuloMotivo = (id: string | null): string => MOTIVOS_PULO.find((m) => m.id === id)?.rotulo ?? '';
