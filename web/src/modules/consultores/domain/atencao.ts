/**
 * "Atenção agora", meta do dia e retornos (contrato §25) — tipos do fio e funções puras de texto/link.
 * Os alertas só aparecem na tela: "Ligar" e "Chamar no WhatsApp" são links que a própria pessoa abre.
 */
import { z } from 'zod';
import { alertaPixSchema } from '@/modules/pagamentos/domain/pagamentos';

export const goalSchema = z.object({
  meta: z.number(),
  feitas: z.number(),
  esperadas: z.number(),
  delta: z.number(),
  faltam: z.number(),
  minutos_uteis: z.number(),
  minutos_por_visita_ritmo: z.number(),
  dia_de_trabalho: z.boolean(),
  conta: z.string(),
  fonte: z.string(),
});
export type GoalView = z.infer<typeof goalSchema>;

/** `intervalo_longo` (lote B §37.6) só chega com `FIELD_BREAKS_ENABLED`. */
export const CODIGOS_ALERTA = ['nao_iniciou', 'sem_registro', 'visita_aberta', 'ritmo_atrasado', 'parada_vencida', 'intervalo_longo'] as const;

export const alertaSchema = z.object({
  code: z.enum(CODIGOS_ALERTA),
  severity: z.enum(['alta', 'media']),
  consultant_id: z.string(),
  consultant_name: z.string(),
  praca_id: z.string(),
  praca_name: z.string(),
  phone: z.string(),
  message: z.string(),
  conta: z.string(),
  since: z.string().nullable(),
});
export type Alerta = z.infer<typeof alertaSchema>;

export const atencaoSchema = z.object({
  day: z.string(),
  generated_at: z.string(),
  now: z.string(),
  dia_de_trabalho: z.boolean(),
  thresholds: z.object({
    alerta_inicio_apos_min: z.number(),
    alerta_visita_aberta_min: z.number(),
    alerta_sem_registro_min: z.number(),
    alerta_ritmo_atras: z.number(),
    alerta_parada_vencida_min: z.number(),
  }),
  alerts: z.array(alertaSchema),
  consultants: z.array(
    z.object({
      consultant_id: z.string(),
      name: z.string(),
      praca_id: z.string(),
      praca_name: z.string(),
      phone: z.string(),
      status: z.enum(['em_jornada', 'encerrou', 'nao_iniciou']),
      goal: goalSchema,
      alerts: z.array(alertaSchema),
      /** Lote B §37.6: início do intervalo aberto; ausente com `FIELD_BREAKS_ENABLED` desligada. */
      on_break_since: z.string().nullable().optional(),
    }),
  ),
  /** F9 (§29.8): Pix bloqueado/falho. Ausente com `FIELD_PAYOUTS_ENABLED` desligada. */
  payout_alerts: z.array(alertaPixSchema).optional(),
  /** S3 (§32.7): divergência declaração × Freela. Ausente com `FIELD_DECLARED_SIGNUPS_ENABLED` desligada. */
  declared_alerts: z.array(z.object({ type: z.literal('declared_divergence'), consultant_id: z.string(), name: z.string(), praca_id: z.string(), declared: z.number().int(), unmatched: z.number().int(), divergence_pct: z.number().int(), message: z.string() })).optional(),
});
export type AtencaoView = z.infer<typeof atencaoSchema>;

export const followupSchema = z.object({
  visit_id: z.string(),
  lead_id: z.string(),
  lead_name: z.string(),
  phone: z.string(),
  address: z.string(),
  consultant_id: z.string(),
  consultant_name: z.string(),
  praca_id: z.string().nullable(),
  followup_what: z.string(),
  followup_date: z.string(),
  /** `HH:mm` de Brasília (contrato §30.3); ausente em respostas antigas. */
  followup_time: z.string().nullable().optional(),
  /** `(11) 9****-4321`; a equipe nunca recebe o número completo. */
  contact_phone_masked: z.string().nullable().optional(),
  /** Número completo: SÓ em `GET /v1/campo/followups` (as visitas do próprio consultor). */
  contact_phone: z.string().nullable().optional(),
  due: z.enum(['hoje', 'atrasado']),
  days_late: z.number(),
  visited_at: z.string(),
  interlocutor_name: z.string().nullable(),
  interest: z.string().nullable(),
});
export type FollowupView = z.infer<typeof followupSchema>;

export const followupsSchema = z.object({
  day: z.string(),
  today: z.number(),
  overdue: z.number(),
  total: z.number(),
  truncated: z.boolean(),
  items: z.array(followupSchema),
});
export type FollowupsResponse = z.infer<typeof followupsSchema>;

/** Chaves de alerta do `GET/PUT /v1/consultores/settings/config` (§25.1). */
export const configAlertasSchema = z.object({
  alerta_inicio_apos_min: z.number(),
  alerta_visita_aberta_min: z.number(),
  alerta_sem_registro_min: z.number(),
  alerta_ritmo_atras: z.number(),
  alerta_parada_vencida_min: z.number(),
  dias_trabalho: z.array(z.number()),
  retornos_no_roteiro: z.boolean(),
});
export type ConfigAlertas = z.infer<typeof configAlertasSchema>;

// ── contato ─────────────────────────────────────────────────

const soDigitos = (s: string) => s.replace(/\D/g, '');
/** DDI 55 só quando falta: 10 ou 11 dígitos é número brasileiro sem código do país. */
const comDdi = (d: string) => (d.startsWith('55') && d.length >= 12 ? d : `55${d}`);

/** `tel:` só com número plausível (≥ 10 dígitos com DDD). A pessoa é quem toca e liga. */
export function linkLigar(phone: string): string | null {
  const d = soDigitos(phone);
  return d.length >= 10 ? `tel:+${comDdi(d)}` : null;
}

/** `wa.me` só com número plausível; nada é enviado — abre a conversa para a própria pessoa. */
export function linkWhatsApp(phone: string, texto?: string): string | null {
  const d = soDigitos(phone);
  if (d.length < 10) return null;
  const base = `https://wa.me/${comDdi(d)}`;
  return texto ? `${base}?text=${encodeURIComponent(texto)}` : base;
}

// ── texto ───────────────────────────────────────────────────

export const ROTULO_ALERTA: Record<(typeof CODIGOS_ALERTA)[number], string> = {
  nao_iniciou: 'Não iniciou',
  sem_registro: 'Sem registro',
  visita_aberta: 'Visita aberta',
  ritmo_atrasado: 'Ritmo atrasado',
  parada_vencida: 'Parada vencida',
  intervalo_longo: 'Intervalo longo',
};

/** Linha de ritmo da tabela da equipe: ícone + texto, nunca só cor. */
export function ritmoDaLinha(g: GoalView, status: 'em_jornada' | 'encerrou' | 'nao_iniciou'): { texto: string; ok: boolean } {
  if (!g.dia_de_trabalho) return { texto: 'Dia sem expediente', ok: true };
  if (status === 'encerrou') return { texto: `Encerrou com ${g.feitas} de ${g.meta}`, ok: g.feitas >= g.meta };
  if (g.delta > 0) return { texto: `✓ ${g.delta} à frente`, ok: true };
  if (g.delta === 0) return { texto: '✓ no ponto', ok: true };
  return { texto: `⚠ ${-g.delta} atrás`, ok: false };
}

export const porcentagem = (feitas: number, meta: number): number => Math.min(100, Math.round((feitas / Math.max(meta, 1)) * 100));

export function rotuloVencimento(f: Pick<FollowupView, 'due' | 'days_late'>): string {
  if (f.due === 'hoje') return 'Hoje';
  return `Atrasado há ${f.days_late} ${f.days_late === 1 ? 'dia' : 'dias'}`;
}

/** "Hoje às 15:30" / "Atrasado há 2 dias" + hora combinada, se houver (a hora só faz sentido para hoje; atrasado mostra o dia). */
export function rotuloVencimentoComHora(f: Pick<FollowupView, 'due' | 'days_late' | 'followup_time'>): string {
  const base = rotuloVencimento(f);
  return f.followup_time ? `${base}, combinado para ${f.followup_time}` : base;
}

/** "2026-10-19" → "19/10". */
export function diaCurto(day: string): string {
  const [, m = '', d = ''] = day.split('-');
  return `${d}/${m}`;
}

export const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const;
