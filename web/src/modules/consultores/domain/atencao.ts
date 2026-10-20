/**
 * "Atenção agora", meta do dia e retornos (contrato §25) — tipos do fio e funções puras de texto/link.
 * Os alertas só aparecem na tela: "Ligar" e "Chamar no WhatsApp" são links que a própria pessoa abre.
 */
import { z } from 'zod';

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

export const CODIGOS_ALERTA = ['nao_iniciou', 'sem_registro', 'visita_aberta', 'ritmo_atrasado', 'parada_vencida'] as const;

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
    }),
  ),
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

/** "2026-10-19" → "19/10". */
export function diaCurto(day: string): string {
  const [, m = '', d = ''] = day.split('-');
  return `${d}/${m}`;
}

export const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const;
