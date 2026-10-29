import { fmtBRL } from '@/lib/format';
import type { LeadsMetricsView } from '../infrastructure/leads.api';

/**
 * Textos puros do Funil (UX §3.4): a conta de cada taxa, os selos do automático,
 * "12 dias parado", a cor da bolinha da etapa e os estados da tela. Sem React,
 * para testar sem tela.
 */

/** "2 de 4 = 50%". Sem `n`/`de` (API antiga) volta o "%" de antes. */
export function textoConversao(n: number | undefined, de: number | undefined, pct: number | undefined): string {
  const taxa = pct ?? 0;
  if (n === undefined || de === undefined) return `${taxa}%`;
  if (de === 0) return `${n} de ${de}`;
  return `${n} de ${de} = ${taxa}%`;
}

/** O nome do selo do Freela; honesto: o campo conta vagas pagas e não canceladas (achado 13). */
export function nomeSeloFreela(contratacoes: number | null | undefined): string | null {
  if (!contratacoes || contratacoes < 1) return null;
  return contratacoes === 1 ? 'Freela: 1 contratação paga' : `Freela: ${contratacoes} contratações pagas`;
}

export interface SeloDoLead {
  last_stage_auto: boolean;
  freela_hirings: number | null;
}

/** Os nomes (também os acessíveis) dos selos de um cartão, na ordem em que aparecem. */
export function textoDeSelos(selo: SeloDoLead | undefined): string[] {
  if (!selo) return [];
  const nomes: string[] = [];
  if (selo.last_stage_auto) nomes.push('Automático');
  const freela = nomeSeloFreela(selo.freela_hirings);
  if (freela) nomes.push(freela);
  return nomes;
}

/** "1 lead · R$ 1.500" na coluna e no acordeão de cada etapa (UX final, achado 17: nunca "1 leads"). */
export const totalDaEtapa = (qtd: number, soma: number): string => `${qtd} ${qtd === 1 ? 'lead' : 'leads'} · ${fmtBRL(soma)}`;

export function diasParado(dias: number): string {
  if (dias <= 0) return 'Hoje';
  return dias === 1 ? '1 dia parado' : `${dias} dias parado`;
}

/** A cor da etapa só vai para a bolinha (decoração); o texto fica `text-foreground` (achado 9). */
export function corDaBolinha(etapa: { n: number; color: string }): { backgroundColor: string } {
  return { backgroundColor: etapa.color };
}

/** Número que ainda não chegou (ou não deu para ler): nunca "0", que pareceria resultado. */
export const SEM_DADO = '—';

export interface TextosDasMetricas {
  total: string;
  contatado: string;
  ativo: string;
  dias: string;
  parados: string;
  valor: string;
  /** Parados > 0: ícone de alerta e cor de aviso (só com o número lido). */
  alertaParados: boolean;
}

/** Os seis números do topo (`GET /v1/leads/metrics`); sem a resposta (carregando ou erro), "—" nos seis. */
export function textosDasMetricas(m: LeadsMetricsView | undefined): TextosDasMetricas {
  if (!m) {
    return { total: SEM_DADO, contatado: SEM_DADO, ativo: SEM_DADO, dias: SEM_DADO, parados: SEM_DADO, valor: SEM_DADO, alertaParados: false };
  }
  return {
    total: String(m.total),
    contatado: textoConversao(m.conv_contact_n, m.conv_contact_de, m.conv_contact),
    ativo: textoConversao(m.conv_active_n, m.conv_active_de, m.conv_active),
    dias: `${m.avg_days} dias`,
    parados: String(m.stalled),
    valor: fmtBRL(m.pipeline),
    alertaParados: m.stalled > 0,
  };
}

export type EstadoDoQuadro = 'erro' | 'carregando' | 'sem-leads' | 'sem-resultado' | 'quadro';

/**
 * O que ocupa o lugar do quadro (UX §3.4, Estados). `lido` = leads e etapas chegaram; `total` = leads da praça; `filtrados` = depois da
 * busca, do dono e da classificação.
 */
export function estadoDoQuadro(p: { erro: boolean; lido: boolean; total: number; filtrados: number }): EstadoDoQuadro {
  if (p.erro) return 'erro';
  if (!p.lido) return 'carregando';
  if (p.total === 0) return 'sem-leads';
  if (p.filtrados === 0) return 'sem-resultado';
  return 'quadro';
}
