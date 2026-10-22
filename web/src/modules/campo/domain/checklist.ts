/**
 * Checklist de abordagem da visita (lote B, contrato §35) — espelho no aparelho de `api/src/domain/checklist-rules.ts`.
 * Quem decide é o servidor (`422 ANSWERS_INCOMPLETE`); aqui é para a tela mostrar a lista e o que falta, inclusive sem sinal.
 */
import type { FluxoVisita } from './fluxo';

export interface EtapaChecklist {
  id: string;
  text: string;
  done: boolean;
  note: string | null;
}
export type ObrigatoriedadeChecklist = 'nao' | 'todas';
export interface ChecklistVisitaView {
  required: ObrigatoriedadeChecklist;
  items: EtapaChecklist[];
  done: number;
  total: number;
}
export interface ChecklistConfigCampo {
  items: { id: string; text: string }[];
  obrigatorio: ObrigatoriedadeChecklist;
  fluxos: FluxoVisita[];
  aberto: boolean;
}
export interface MarcaChecklist {
  id: string;
  done?: boolean;
  note?: string | null;
}
export interface ChecklistTela {
  required: ObrigatoriedadeChecklist;
  items: EtapaChecklist[];
}

/**
 * A lista que a tela mostra: a FOTO do servidor quando a visita já chegou lá (sem foto = sem checklist); sem a visita no
 * servidor (check-in na fila), a configuração guardada do `/me`, se o fluxo da visita estiver nela. As marcas do rascunho vão por cima.
 */
export function checklistDaTela(p: {
  ligado: boolean;
  flow: FluxoVisita;
  naServidor: boolean;
  foto?: ChecklistVisitaView | null;
  config?: ChecklistConfigCampo | null;
  marcas?: MarcaChecklist[] | null;
}): ChecklistTela | null {
  if (!p.ligado) return null;
  let base: ChecklistTela | null = null;
  if (p.naServidor) {
    if (p.foto) base = { required: p.foto.required, items: p.foto.items.map((e) => ({ ...e })) };
  } else if (p.config && p.config.fluxos.includes(p.flow)) {
    base = { required: p.config.obrigatorio, items: p.config.items.map((e) => ({ id: e.id, text: e.text, done: false, note: null })) };
  }
  if (!base) return null;
  const porId = new Map((p.marcas ?? []).map((m) => [m.id, m]));
  return {
    required: base.required,
    items: base.items.map((e) => {
      const m = porId.get(e.id);
      if (!m) return e;
      return { ...e, done: typeof m.done === 'boolean' ? m.done : e.done, note: m.note === undefined ? e.note : m.note };
    }),
  };
}

/** Todas as marcas (o rascunho leva a lista inteira; o servidor ignora `id` que não conhece). */
export function marcarEtapa(c: ChecklistTela, id: string, mudanca: { done?: boolean; note?: string | null }): MarcaChecklist[] {
  return c.items.map((e) => (e.id === id ? { id: e.id, done: mudanca.done ?? e.done, note: mudanca.note === undefined ? e.note : mudanca.note } : { id: e.id, done: e.done, note: e.note }));
}

/** Mesmo texto do servidor: `roteiro da visita (etapas 3, 5)`; só quando a lista é obrigatória. */
export function pendenciasChecklist(c: ChecklistTela | null): string[] {
  if (!c || c.required !== 'todas') return [];
  const faltam = c.items.map((e, i) => (e.done ? 0 : i + 1)).filter((n) => n > 0);
  if (faltam.length === 0) return [];
  return [`roteiro da visita (${faltam.length === 1 ? 'etapa' : 'etapas'} ${faltam.join(', ')})`];
}

/** "Falta marcar 3 etapas do roteiro da conversa." (UX §3.5, V6). */
export function fraseChecklist(item: string): string | null {
  const m = /^roteiro da visita \(etapas? ([\d, ]+)\)$/.exec(item);
  if (!m) return null;
  const n = m[1]!.split(',').length;
  return `Falta marcar ${n} ${n === 1 ? 'etapa' : 'etapas'} do roteiro da conversa.`;
}

/** Cronômetro da visita aberta: mm:ss (h:mm:ss a partir de 1 hora). */
export function cronometro(desdeMs: number, agoraMs: number): string {
  const s = Math.max(0, Math.floor((agoraMs - desdeMs) / 1000));
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
