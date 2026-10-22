import { z } from 'zod';

/** Wire do restante da Lovable, lote A — contrato §33 (painel e resumo do dia) e §33.1/§33.2 (chaves e `features`). */

export const featuresLovableSchema = z.object({ dashboard: z.boolean(), day_summary: z.boolean(), map_pins: z.boolean() });
export type FeaturesLovable = z.infer<typeof featuresLovableSchema>;
export const SEM_FEATURES: FeaturesLovable = { dashboard: false, day_summary: false, map_pins: false };

/** Chaves do §23.1 (raio) e §33.2 (resumo e painel) em `settings/config`. Servidor antigo não manda = padrão. */
export const configLovableSchema = z.object({
  raio_checkin_m: z.number().default(200),
  ui_resumo_dia: z.enum(['nota', 'numeros', 'desligado']).default('nota'),
  nota_peso_rota: z.number().default(7),
  nota_peso_conversao: z.number().default(3),
  nota_meta_conversao_pct: z.number().default(30),
  nota_intervalo_alerta_min: z.number().default(75),
  painel_tempo_medio: z.enum(['intervalo', 'duracao']).default('intervalo'),
  painel_gap_max_min: z.number().default(120),
  features: featuresLovableSchema.optional(),
});
export type ConfigLovable = z.infer<typeof configLovableSchema>;
export type ConfigLovableCampos = Omit<ConfigLovable, 'features'>;

/** Só as chaves editáveis (sem `features`, que é do servidor). */
export const camposConfigLovable = (c: ConfigLovable): ConfigLovableCampos => ({
  raio_checkin_m: c.raio_checkin_m,
  ui_resumo_dia: c.ui_resumo_dia,
  nota_peso_rota: c.nota_peso_rota,
  nota_peso_conversao: c.nota_peso_conversao,
  nota_meta_conversao_pct: c.nota_meta_conversao_pct,
  nota_intervalo_alerta_min: c.nota_intervalo_alerta_min,
  painel_tempo_medio: c.painel_tempo_medio,
  painel_gap_max_min: c.painel_gap_max_min,
});

/** O que o formulário pode mandar: só chaves do servidor que existem com a flag (as outras ficam de fora do PUT). */
export function corpoConfigLovable(f: ConfigLovableCampos, features: FeaturesLovable): Partial<ConfigLovableCampos> {
  return {
    raio_checkin_m: f.raio_checkin_m,
    ...(features.day_summary
      ? {
          ui_resumo_dia: f.ui_resumo_dia,
          nota_peso_rota: f.nota_peso_rota,
          nota_peso_conversao: f.nota_peso_conversao,
          nota_meta_conversao_pct: f.nota_meta_conversao_pct,
          nota_intervalo_alerta_min: f.nota_intervalo_alerta_min,
        }
      : {}),
    ...(features.dashboard ? { painel_tempo_medio: f.painel_tempo_medio, painel_gap_max_min: f.painel_gap_max_min } : {}),
  };
}

/** Erros do formulário, com a conta (o servidor confere de novo). */
export function errosConfigLovable(f: ConfigLovableCampos, features: FeaturesLovable): string[] {
  const e: string[] = [];
  const inteiro = (v: number, a: number, b: number) => Number.isInteger(v) && v >= a && v <= b;
  if (!inteiro(f.raio_checkin_m, 50, 1000)) e.push('Raio da chegada: de 50 a 1000 m.');
  if (features.day_summary) {
    if (f.nota_peso_rota + f.nota_peso_conversao !== 10)
      e.push(`Os pesos da nota precisam somar 10 (${f.nota_peso_rota} + ${f.nota_peso_conversao} = ${f.nota_peso_rota + f.nota_peso_conversao}).`);
    if (!inteiro(f.nota_meta_conversao_pct, 1, 100)) e.push('Positivação que vale a parte cheia: de 1% a 100%.');
    if (!inteiro(f.nota_intervalo_alerta_min, 15, 480)) e.push('Aviso de intervalo longo: de 15 a 480 min.');
  }
  if (features.dashboard && !inteiro(f.painel_gap_max_min, 10, 480)) e.push('Intervalo máximo entre visitas: de 10 a 480 min.');
  return e;
}

// ── painel (§33.4) ─────────────────────────────────────────

const chavesCartao = z.object({
  pct_done: z.string(),
  visits: z.string(),
  positivation: z.string(),
  time: z.string(),
  signups: z.string(),
  vouchers: z.string(),
  pracas_open: z.string(),
  leads_mapped: z.string(),
});

export const painelSchema = z.object({
  from: z.string(),
  to: z.string(),
  praca_id: z.string().nullable(),
  today: z.string(),
  generated_at: z.string(),
  kpis: z.object({
    planned_stops: z.number(),
    done_stops: z.number(),
    pct_done: z.number().nullable(),
    visits: z.number(),
    visits_off_route: z.number(),
    signups: z.number(),
    signups_source: z.enum(['declared', 'freela_confirmed', 'misto']),
    declared_now: z.number(),
    positivation_pct: z.number().nullable(),
    avg_gap_min: z.number().nullable(),
    avg_duration_min: z.number().nullable(),
    time_headline: z.enum(['intervalo', 'duracao']),
    vouchers: z.null(),
    pracas_open: z.number(),
    consultants_active: z.number(),
    leads_mapped: z.number(),
    leads_without_exact_location: z.number(),
  }),
  ranking: z.array(z.object({ consultant_id: z.string(), name: z.string(), praca_id: z.string(), visits: z.number(), signups: z.number(), positivation_pct: z.number().nullable() })),
  by_result: z.array(z.object({ code: z.string(), label: z.string(), color: z.string(), n: z.number() })),
  conta: chavesCartao,
  fonte: chavesCartao,
  signup_sync_enabled: z.boolean(),
});
export type PainelView = z.infer<typeof painelSchema>;

export const PERIODOS = [
  { id: 'hoje', rotulo: 'Hoje', dias: 1 },
  { id: '7', rotulo: '7 dias', dias: 7 },
  { id: '30', rotulo: '30 dias', dias: 30 },
  { id: '90', rotulo: '90 dias', dias: 90 },
] as const;
export type Periodo = (typeof PERIODOS)[number]['id'];

const somaDias = (dia: string, n: number): string => {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** "7 dias" = hoje e os 6 anteriores, contados no dia de Brasília (como a Lovable). */
export function intervaloDoPeriodo(p: Periodo, hoje: string): { from: string; to: string } {
  const dias = PERIODOS.find((x) => x.id === p)?.dias ?? 1;
  return { from: somaDias(hoje, -(dias - 1)), to: hoje };
}

export interface Cartao {
  id: keyof PainelView['conta'];
  titulo: string;
  numero: string;
  conta: string;
  fonte: string;
}

const n = (x: number): string => x.toLocaleString('pt-BR');

/** Os 8 cartões, na ordem da Lovable, cada um com a conta e a fonte (UX §3.1; "Não ligado" nunca vira "0"). */
export function cartoesDoPainel(p: PainelView): Cartao[] {
  const k = p.kpis;
  const tempo = k.time_headline === 'intervalo' ? k.avg_gap_min : k.avg_duration_min;
  return [
    { id: 'pct_done', titulo: 'Visitas concluídas', numero: k.pct_done == null ? '—' : `${k.pct_done}%`, conta: p.conta.pct_done, fonte: p.fonte.pct_done },
    { id: 'positivation', titulo: 'Positivação', numero: k.positivation_pct == null ? '—' : `${k.positivation_pct}%`, conta: p.conta.positivation, fonte: p.fonte.positivation },
    { id: 'time', titulo: k.time_headline === 'intervalo' ? 'Tempo entre visitas' : 'Tempo dentro do local', numero: tempo == null ? '—' : `${tempo} min`, conta: p.conta.time, fonte: p.fonte.time },
    { id: 'visits', titulo: 'Visitas realizadas', numero: n(k.visits), conta: p.conta.visits, fonte: p.fonte.visits },
    { id: 'signups', titulo: 'Cadastros', numero: n(k.signups), conta: p.conta.signups, fonte: p.fonte.signups },
    { id: 'vouchers', titulo: 'Cupons', numero: '—', conta: p.conta.vouchers, fonte: p.fonte.vouchers },
    { id: 'pracas_open', titulo: 'Praças abertas', numero: n(k.pracas_open), conta: p.conta.pracas_open, fonte: p.fonte.pracas_open },
    { id: 'leads_mapped', titulo: 'Estabelecimentos mapeados', numero: n(k.leads_mapped), conta: p.conta.leads_mapped, fonte: p.fonte.leads_mapped },
  ];
}

/** "1º", "2º"… (medalha sempre com o texto, UX §3.1). */
export const posicao = (i: number): string => `${i + 1}º`;

/** CSV do ranking (`;` e vírgula decimal, como o Excel em pt-BR abre). */
export function csvRanking(p: PainelView): string {
  const esc = (s: string) => (/[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const linhas = [`Posição;Consultor;Visitas;Cadastros;Positivação (%)`];
  p.ranking.forEach((r, i) => linhas.push([posicao(i), esc(r.name), r.visits, r.signups, r.positivation_pct ?? ''].join(';')));
  linhas.push(`Período;${p.from} a ${p.to}`);
  linhas.push(`Ordem;cadastros, depois positivação`);
  return linhas.join('\n');
}

// ── resumo do dia (§33.5) ──────────────────────────────────

export const resumoDiaSchema = z.object({
  day: z.string(),
  consultant_id: z.string(),
  consultant_name: z.string(),
  calculated_at: z.string(),
  display: z.enum(['nota', 'numeros', 'desligado']),
  day_open: z.boolean(),
  planned: z.number(),
  planned_source: z.enum(['roteiro', 'meta']),
  route_visited: z.number().nullable(),
  visits_done: z.number(),
  signups: z.number(),
  signups_source: z.enum(['declared', 'freela_confirmed', 'misto']),
  signup_sync_enabled: z.boolean(),
  cumprimento_pct: z.number(),
  positivacao_pct: z.number().nullable(),
  nota: z.number().nullable(),
  partes: z.object({ rota: z.number(), conversao: z.number() }).nullable(),
  total_min: z.number(),
  first_start: z.string().nullable(),
  last_end: z.string().nullable(),
  intervalo_min: z.number().nullable(),
  /** Lote B §37.6: só com o intervalo registrado (flag ligada). */
  trabalhado_min: z.number().optional(),
  avg_visit_min: z.number().nullable(),
  avaliacao: z.array(z.string()),
  conta: z.array(z.string()),
});
export type ResumoDiaView = z.infer<typeof resumoDiaSchema>;

/** 520 → "8h40"; 45 → "45 min". */
export const duracao = (min: number): string => (min >= 60 ? `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}` : `${min} min`);
/** 8.1 → "8,1"; 10 → "10,0". */
export const notaTexto = (x: number): string => x.toFixed(1).replace('.', ',');
/** "09:02" → "9h02". */
export const horaCurta = (hhmm: string): string => `${Number(hhmm.slice(0, 2))}h${hhmm.slice(3, 5)}`;

/** As linhas de números do resumo (o que aparece também com `numeros`). */
export function linhasDoResumo(r: ResumoDiaView): [string, string][] {
  const tempo = `${duracao(r.total_min)}${r.first_start ? ` (${horaCurta(r.first_start)}–${r.last_end ? horaCurta(r.last_end) : 'agora'})` : ''}`;
  return [
    [r.planned_source === 'roteiro' ? 'Paradas previstas' : 'Meta do dia (sem roteiro)', String(r.planned)],
    ['Visitadas', `${r.route_visited ?? r.visits_done} (${r.cumprimento_pct}%)`],
    [r.signups_source === 'declared' ? 'Cadastros declarados' : 'Cadastros confirmados', `${r.signups}${r.positivacao_pct == null ? '' : ` (${r.positivacao_pct}%)`}`],
    ['Tempo do dia', tempo],
    ['Intervalo', r.intervalo_min == null ? 'não registrado' : duracao(r.intervalo_min)],
    // Lote B §37.6: tempo trabalhado = tempo do dia − intervalo (a conta vem no "Como contamos").
    ...(r.trabalhado_min !== undefined ? [['Tempo trabalhado (dia − intervalo)', duracao(r.trabalhado_min)] as [string, string]] : []),
    ['Tempo médio na visita', r.avg_visit_min == null ? '—' : `${r.avg_visit_min} min`],
  ];
}
