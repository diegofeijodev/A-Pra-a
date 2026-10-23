/**
 * Ganho por cadastro declarado (modo do chefe S3, contrato §32) — regras PURAS: classificação da declaração
 * frente ao Freela (pareamento pelo `lead_id`), limite diário, divergência e alerta. Sem banco nem relógio.
 */
export const MOTIVOS_ANULACAO = ['not_confirmed', 'duplicate', 'admin_review', 'fraud'] as const;
export type MotivoAnulacao = (typeof MOTIVOS_ANULACAO)[number];

export const ROTULO_MOTIVO_ANULACAO: Record<MotivoAnulacao, string> = {
  not_confirmed: 'Não confirmado pelo Freela',
  duplicate: 'Cadastro duplicado',
  admin_review: 'Revisão da equipe',
  fraud: 'Suspeita de fraude',
};

export const STATUS_DECLARACAO = ['confirmed', 'pending', 'unmatched', 'voided'] as const;
export type StatusDeclaracao = (typeof STATUS_DECLARACAO)[number];

/** Um `field_signups` ligado ao lead da declaração. */
export interface CadastroDoLead {
  consultant_id: string;
  /** O evento da regra de confirmação (§27.4) já aconteceu. */
  confirmado: boolean;
}

/**
 * `voided` · `confirmed` (cadastro do MESMO consultor com o evento da regra) · `pending` (do mesmo consultor, sem o
 * evento) · `unmatched` (nenhum cadastro ligado ao lead, ou só de outro consultor: aí `por_outro` = true).
 */
export function classificarDeclaracao(p: {
  anulada: boolean;
  consultant_id: string;
  cadastros: readonly CadastroDoLead[];
}): { status: StatusDeclaracao; por_outro: boolean } {
  if (p.anulada) return { status: 'voided', por_outro: false };
  const meus = p.cadastros.filter((c) => c.consultant_id === p.consultant_id);
  if (meus.some((c) => c.confirmado)) return { status: 'confirmed', por_outro: false };
  if (meus.length > 0) return { status: 'pending', por_outro: false };
  return { status: 'unmatched', por_outro: p.cadastros.length > 0 };
}

export interface DeclaracaoParaLimite {
  id: string;
  consultant_id: string;
  declared_day: string;
  declared_at: Date;
  anulada: boolean;
}

/**
 * Ids das declarações ACIMA do limite diário. Mesma conta do pagamento: por consultor e dia, só as não anuladas,
 * em ordem de hora; as `cap` primeiras entram, as demais ficam "acima do limite". `cap` null = sem limite.
 */
export function acimaDoLimite(
  decls: readonly DeclaracaoParaLimite[],
  /** L13 (§45.5): recebe também o consultor (a regra própria dele pode ter outro limite). */
  capDoDia: (dia: string, consultantId: string) => number | null,
): Set<string> {
  const grupos = new Map<string, DeclaracaoParaLimite[]>();
  for (const d of decls) {
    if (d.anulada) continue;
    const k = `${d.consultant_id}|${d.declared_day}`;
    const g = grupos.get(k);
    if (g) g.push(d);
    else grupos.set(k, [d]);
  }
  const acima = new Set<string>();
  for (const [k, g] of grupos) {
    const [consultantId, dia] = k.split('|') as [string, string];
    const cap = capDoDia(dia, consultantId);
    if (cap === null) continue;
    g.sort((a, b) => a.declared_at.getTime() - b.declared_at.getTime() || a.id.localeCompare(b.id));
    for (const d of g.slice(cap)) acima.add(d.id);
  }
  return acima;
}

export interface Contagens {
  declared: number;
  confirmed: number;
  pending_confirmation: number;
  unmatched: number;
  voided: number;
  over_cap: number;
}

export const contagensVazias = (): Contagens => ({
  declared: 0,
  confirmed: 0,
  pending_confirmation: 0,
  unmatched: 0,
  voided: 0,
  over_cap: 0,
});

export function somar(c: Contagens, status: StatusDeclaracao, acima: boolean): void {
  c.declared++;
  if (status === 'confirmed') c.confirmed++;
  else if (status === 'pending') c.pending_confirmation++;
  else if (status === 'unmatched') c.unmatched++;
  else c.voided++;
  if (acima && status !== 'voided') c.over_cap++;
}

/** `sem correspondência ÷ (declaradas − anuladas) × 100`, inteiro para baixo; 0 sem base. */
export function pctDivergencia(c: Pick<Contagens, 'declared' | 'voided' | 'unmatched'>): number {
  const base = c.declared - c.voided;
  return base > 0 ? Math.floor((c.unmatched * 100) / base) : 0;
}

export function textoDivergencia(c: Pick<Contagens, 'declared' | 'voided' | 'unmatched'>): string {
  const base = c.declared - c.voided;
  return base > 0
    ? `Divergência: ${c.unmatched} sem correspondência no Freela ÷ ${base} declarações válidas (${c.declared} declaradas − ${c.voided} anuladas) = ${pctDivergencia(c)}%.`
    : 'Divergência: sem declarações válidas no período.';
}

/** Alerta "Atenção agora" `declared_divergence` (§32.7): precisa dos DOIS limites. */
export function deveAlertarDivergencia(
  c: Pick<Contagens, 'declared' | 'voided' | 'unmatched'>,
  cfg: { divergencia_alerta_min: number; divergencia_alerta_pct: number },
): boolean {
  return c.unmatched >= cfg.divergencia_alerta_min && pctDivergencia(c) >= cfg.divergencia_alerta_pct;
}
