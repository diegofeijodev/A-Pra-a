import { z } from 'zod';

/**
 * Restante da Lovable, lote B — chaves de `settings/config` do checklist da visita (contrato §35.2) e do intervalo (§37.2),
 * e as `features` que ligam as seções (o web nunca sonda rota desligada). Servidor antigo não manda = padrão.
 */
export const ETAPAS_LOVABLE = [
  { id: 'apresentacao', text: 'Apresentação pessoal e da empresa' },
  { id: 'entender_negocio', text: 'Entender o negócio do cliente' },
  { id: 'identificar_necessidade', text: 'Identificar a necessidade' },
  { id: 'apresentar_solucao', text: 'Apresentar a solução e os benefícios' },
  { id: 'oferecer_cupom', text: 'Oferecer o cupom da 1ª contratação grátis' },
  { id: 'tratar_objecoes', text: 'Tratar objeções' },
  { id: 'fechamento', text: 'Fechamento: cadastro ou próximo passo' },
];
export const MAX_ETAPAS = 20;

export const configLoteBSchema = z.object({
  meta_diaria: z.number().default(30),
  checklist_items: z.array(z.object({ id: z.string(), text: z.string() })).default(ETAPAS_LOVABLE),
  checklist_obrigatorio: z.enum(['nao', 'todas']).default('nao'),
  checklist_fluxos: z.array(z.enum(['simples', 'completo'])).default(['simples', 'completo']),
  checklist_aberto: z.boolean().default(true),
  intervalo_ativo: z.boolean().default(true),
  intervalo_lembrete_min: z.number().default(60),
  alerta_intervalo_min: z.number().default(75),
  features: z.object({ checklist: z.boolean().default(false), breaks: z.boolean().default(false) }).partial().optional(),
});
export type ConfigLoteB = z.infer<typeof configLoteBSchema>;

/** Etapa no formulário: `id` ausente = nova (o servidor dá o id ao salvar). */
export interface EtapaForm {
  id?: string;
  text: string;
}
export interface FormChecklist {
  itens: EtapaForm[];
  obrigatorio: 'nao' | 'todas';
  simples: boolean;
  completo: boolean;
  aberto: boolean;
}

export const formChecklist = (c: ConfigLoteB): FormChecklist => ({
  itens: c.checklist_items.map((e) => ({ ...e })),
  obrigatorio: c.checklist_obrigatorio,
  simples: c.checklist_fluxos.includes('simples'),
  completo: c.checklist_fluxos.includes('completo'),
  aberto: c.checklist_aberto,
});

/** "Voltar ao padrão da Lovable": as 7 etapas, não obrigatório, nos dois fluxos, começa aberto. */
export const FORM_CHECKLIST_LOVABLE: FormChecklist = { itens: ETAPAS_LOVABLE.map((e) => ({ ...e })), obrigatorio: 'nao', simples: true, completo: true, aberto: true };

export function errosChecklist(f: FormChecklist): string[] {
  const e: string[] = [];
  if (f.itens.length < 1) e.push('Deixe ao menos uma etapa.');
  if (f.itens.length > MAX_ETAPAS) e.push(`No máximo ${MAX_ETAPAS} etapas.`);
  f.itens.forEach((it, i) => {
    const t = it.text.trim();
    if (t.length < 1) e.push(`Etapa ${i + 1}: escreva o texto.`);
    else if (t.length > 120) e.push(`Etapa ${i + 1}: até 120 caracteres.`);
  });
  return e;
}

export function corpoChecklist(f: FormChecklist) {
  return {
    checklist_items: f.itens.map((it) => (it.id ? { id: it.id, text: it.text.trim() } : { text: it.text.trim() })),
    checklist_obrigatorio: f.obrigatorio,
    checklist_fluxos: [...(f.simples ? ['simples' as const] : []), ...(f.completo ? ['completo' as const] : [])],
    checklist_aberto: f.aberto,
  };
}

/** A conta do aviso de "obrigatório" (UX §3.9, K2): etapas × meta do dia = toques a mais por dia. */
export const toquesObrigatorios = (etapas: number, metaDiaria: number): string =>
  `Obrigatório soma 1 toque por etapa: ${etapas} × ${metaDiaria} visitas = ${etapas * metaDiaria} toques por dia.`;

export function moverEtapa(itens: EtapaForm[], i: number, delta: -1 | 1): EtapaForm[] {
  const j = i + delta;
  if (j < 0 || j >= itens.length) return itens;
  const c = [...itens];
  [c[i], c[j]] = [c[j]!, c[i]!];
  return c;
}

// ── intervalo (§37.2) ─────────────────────────────────────
export interface FormIntervalo {
  ativo: boolean;
  lembrete: number;
  alerta: number;
}
export const formIntervalo = (c: ConfigLoteB): FormIntervalo => ({ ativo: c.intervalo_ativo, lembrete: c.intervalo_lembrete_min, alerta: c.alerta_intervalo_min });
export function errosIntervalo(f: FormIntervalo): string[] {
  const e: string[] = [];
  const ok = (n: number) => Number.isInteger(n) && n >= 15 && n <= 480;
  if (!ok(f.lembrete)) e.push('Lembrete: minutos inteiros de 15 a 480.');
  if (!ok(f.alerta)) e.push('Alerta da equipe: minutos inteiros de 15 a 480.');
  return e;
}
export const corpoIntervalo = (f: FormIntervalo) => ({ intervalo_ativo: f.ativo, intervalo_lembrete_min: f.lembrete, alerta_intervalo_min: f.alerta });
