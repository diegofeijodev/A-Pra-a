/**
 * Modo do chefe, S1 (contrato §31) — espelho no aparelho de `api/src/domain/modo-campo-rules.ts`.
 * Quem decide é o servidor (`422 ANSWERS_INCOMPLETE`); aqui é para a tela dizer o que falta antes de tentar,
 * inclusive sem sinal. Mesmas tabelas de teste dos dois lados.
 *
 * Origem dos valores do "Perfil do chefe": versão Lovable (`src/lib/visita.ts`).
 */
import type { VisitAnswers } from './campo.types';
import { fraseChecklist } from './checklist';

export type FluxoVisita = 'simples' | 'completo';
export const ehFluxo = (v: unknown): v is FluxoVisita => v === 'simples' || v === 'completo';

export const RESULTADOS_SIMPLES = ['cadastrou', 'ja_usa', 'retorno', 'sem_interesse', 'fechado'] as const;
export type ResultadoSimples = (typeof RESULTADOS_SIMPLES)[number];
export const ehResultadoSimples = (v: unknown): v is ResultadoSimples => (RESULTADOS_SIMPLES as readonly unknown[]).includes(v);

/** Microcopy da spec (UX §2.4). Sem "lead", "check-in", "checkout", "status". */
export const ROTULO_RESULTADO: Record<ResultadoSimples, string> = {
  cadastrou: 'Cadastrou agora',
  ja_usa: 'Já usa o Freela',
  retorno: 'Quer retorno',
  sem_interesse: 'Sem interesse',
  fechado: 'Estabelecimento fechado',
};

export type CampoContato = 'nome' | 'cargo' | 'telefone';
export type JustificativaDistancia = 'nao' | 'opcional' | 'obrigatoria';

export interface ConfigVisita {
  justificativa_distancia: JustificativaDistancia;
  contato_obrigatorio_em: ResultadoSimples[];
  contato_campos: CampoContato[];
  fechado_conta_na_meta: boolean;
  desfazer_segundos: number;
}

/** Padrão da spec (igual ao da API quando a chave não existe). */
export const CONFIG_VISITA_PADRAO: ConfigVisita = {
  justificativa_distancia: 'opcional',
  contato_obrigatorio_em: ['cadastrou', 'retorno'],
  contato_campos: ['nome', 'cargo', 'telefone'],
  fechado_conta_na_meta: true,
  desfazer_segundos: 8,
};

const vazio = (s: string | null | undefined): boolean => !s || !s.trim();

/** Espelho de `faltandoSimples`: mesma ordem e mesmos rótulos. */
export function faltandoSimples(r: VisitAnswers, hoje: string, cfg: ConfigVisita, ctx: { far_from_place: boolean }): string[] {
  if (!ehResultadoSimples(r.result)) return ['resultado da visita'];
  const f: string[] = [];
  if (r.result === 'sem_interesse' && !r.refusal_reason) f.push('motivo');
  if (r.result === 'retorno') {
    if (!r.followup_date) f.push('quando voltar');
    else if (r.followup_date < hoje) f.push('quando voltar (não pode ser no passado)');
  }
  if ((cfg.contato_obrigatorio_em as readonly string[]).includes(r.result)) {
    if (cfg.contato_campos.includes('nome') && vazio(r.interlocutor_name)) f.push('nome de quem atendeu');
    if (cfg.contato_campos.includes('cargo') && !r.interlocutor_role) f.push('cargo de quem atendeu');
    if (cfg.contato_campos.includes('telefone') && vazio(r.contact_phone)) f.push('telefone de quem atendeu');
  }
  if (ctx.far_from_place && cfg.justificativa_distancia === 'obrigatoria' && vazio(r.distance_note)) {
    f.push('motivo de a visita ter sido longe do local');
  }
  return f;
}

/** "Falta escolher o motivo." / "Falta dizer quando voltar." — frases curtas da spec para o primeiro item. */
export function frasePendencia(falta: string[]): string | null {
  if (falta.length === 0) return null;
  const [primeiro] = falta;
  if (primeiro === 'resultado da visita') return 'Falta escolher como foi a visita.';
  if (primeiro === 'motivo') return 'Falta escolher o motivo.';
  if (primeiro?.startsWith('quando voltar')) return 'Falta dizer quando voltar.';
  // Lote B §35.5: o checklist obrigatório (só aparece na lista quando a foto diz `todas`).
  const ck = primeiro ? fraseChecklist(primeiro) : null;
  if (ck) return ck;
  return `Falta informar: ${falta.join(', ')}.`;
}

/**
 * O que vai ao servidor no rascunho do fluxo simples: SEM os campos que o servidor deriva do resultado
 * (`outcome`, `freela_status`, `needs_followup`) — `freela_status` volta como `declarou`, que o rascunho
 * não aceita, então ecoar a resposta do servidor daria 400.
 */
export function rascunhoSimples(a: VisitAnswers): VisitAnswers {
  const copia: Partial<VisitAnswers> = { ...a };
  delete copia.outcome;
  delete copia.freela_status;
  delete copia.needs_followup;
  return copia as VisitAnswers;
}

/** Texto do botão fixo: "Concluir: Sem interesse, Preço". */
export function textoConcluir(r: VisitAnswers, rotuloMotivo: (k: string | null | undefined) => string | null): string {
  if (!ehResultadoSimples(r.result)) return 'Concluir visita';
  const motivo = r.result === 'sem_interesse' ? rotuloMotivo(r.refusal_reason) : null;
  return `Concluir: ${ROTULO_RESULTADO[r.result]}${motivo ? `, ${motivo}` : ''}`;
}

export interface OpcaoQuando {
  id: string;
  rotulo: string;
  /** Dias a partir de hoje (0 = hoje). `null` = "Escolher dia" (o consultor informa a data). */
  dias: number | null;
  /** Hora combinada, quando o chip já a implica. */
  hora?: string;
}

/** "Quando?" do retorno (UX §2.2). */
export const OPCOES_QUANDO: OpcaoQuando[] = [
  { id: 'hoje_tarde', rotulo: 'Hoje à tarde', dias: 0, hora: '14:00' },
  { id: 'amanha', rotulo: 'Amanhã', dias: 1 },
  { id: 'em_2_dias', rotulo: 'Em 2 dias', dias: 2 },
  { id: 'escolher', rotulo: 'Escolher dia', dias: null },
];

export const HORAS_RETORNO: [string, string][] = [
  ['09:00', 'Manhã'],
  ['14:00', 'Tarde'],
];
