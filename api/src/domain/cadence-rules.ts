/**
 * Regras puras das cadências — porta literal de
 * `.prototype/src/lib/praca/cadencias.ts:48-131`.
 *
 * Só decisão, nenhum banco: o motor (`CadenceEngineService`) e o painel
 * (`CadencesService.stats`) chamam daqui. É o que permite testar "quando o
 * passo 3 vence" e "quem entra sozinho" sem subir Postgres.
 *
 * Diferença em relação ao protótipo: lá as funções recebiam o `Lead` inteiro do
 * `localStorage`; aqui recebem só o recorte que a regra olha (eventos, vagas,
 * etapa, `reheat_at`), porque o servidor não carrega a ficha inteira do lead
 * para decidir um passo.
 */
import { todaySp } from '../common/time/dates';

/** O nó no recorte que as regras enxergam — `kind`, `day` e a identidade. */
export interface CadenceRuleNode {
  id: string;
  kind: string;
  day: number;
}

/** Evento da timeline do lead: só o tipo e o instante (ISO UTC) importam. */
export interface RuleEvent {
  kind: string;
  at: string;
}

/** Vaga do lead — data "só dia" ("YYYY-MM-DD"). */
export interface RuleVaga {
  date: string;
}

/** O que a regra de entrada automática olha no lead. */
export interface EntryLead {
  stage: number;
  reheat_at: string | null;
}

/** Uma linha do log da inscrição: qual nó já foi cumprido. */
export interface RuleLog {
  node_id: string;
}

/** Um dia em milissegundos — o passo sem compressão anda de dia em dia. */
const UM_DIA_MS = 86_400_000;

/** Passo é o que a pessoa recebe: mensagem ou tarefa. Condição não é passo. */
export const isStep = (n: { kind: string }): boolean => n.kind === 'msg' || n.kind === 'task';

/** Só os passos, na ordem da cadência — é a numeração que a tela mostra. */
export const stepNodes = <T extends { kind: string }>(nodes: T[]): T[] => nodes.filter(isStep);

/**
 * Respondeu qualquer coisa depois de entrar na cadência? É a saída mais
 * importante do motor: quem responde sai na hora e vira conversa de gente.
 *
 * Comparação de string ISO UTC (não `new Date()`): os dois lados vêm do mesmo
 * formato, e string é mais barato dentro do laço do motor.
 */
export function respondedSince(events: RuleEvent[], since: string): boolean {
  return events.some((e) => e.kind === 'msg_in' && e.at >= since);
}

/**
 * Abriu vaga depois de entrar? Vaga na ficha a partir do dia da inscrição, ou
 * etapa 6+ (a etapa "Primeira vaga" já é a vaga rodando).
 */
export function openedVaga(vagas: RuleVaga[], stage: number, since: string): boolean {
  return vagas.some((v) => v.date >= since.slice(0, 10)) || stage >= 6;
}

/**
 * Condição da entrada automática (`AUTO_ENTRIES` do catálogo). As outras
 * regras de entrada — praça em mapeamento, primeiro turno do freelancer e
 * manual — entram na mão, pelo `POST /v1/cadences/:id/enroll`.
 *
 * `hoje` entra por parâmetro (padrão: hoje em Brasília) para o teste fixar o
 * dia; em produção ninguém passa.
 */
export function matchesEntry(rule: string, lead: EntryLead, hoje: string = todaySp()): boolean {
  switch (rule) {
    case 'stage_novo':
      return lead.stage === 1;
    case 'reheat_due':
      return !!lead.reheat_at && lead.reheat_at <= hoje;
    case 'first_vaga':
      return lead.stage === 6;
    default:
      return false;
  }
}

/**
 * Instante (ISO UTC) em que o nó do dia `day` vence, contando da entrada.
 *
 * `compressSec` é o "Testar comigo": cada dia da cadência vira alguns segundos,
 * então a trilha inteira roda na frente de quem está olhando a tela.
 */
export function stepDueAt(startedAt: string, day: number, compressSec?: number | null): string {
  const base = new Date(startedAt).getTime();
  const ms = compressSec ? day * compressSec * 1000 : day * UM_DIA_MS;
  return new Date(base + ms).toISOString();
}

/**
 * Índice (entre os PASSOS) do próximo passo que a pessoa vai receber —
 * `steps.length` quando a trilha acabou. É o "passo 3 de 4" da tela.
 */
export function stepIndexOf(nodes: CadenceRuleNode[], logs: RuleLog[]): number {
  const steps = stepNodes(nodes);
  const feitos = new Set(logs.map((l) => l.node_id));
  const idx = steps.findIndex((n) => !feitos.has(n.id));
  return idx < 0 ? steps.length : idx;
}

/**
 * Próximo nó a executar — **condição incluída**, diferente de `stepIndexOf`.
 * É por aqui que o motor caminha: a condição também é cumprida e vai para o
 * log, senão o motor a avaliaria de novo a cada rodada.
 */
export function firstPendingNode<T extends { id: string }>(nodes: T[], logs: RuleLog[]): T | undefined {
  const feitos = new Set(logs.map((l) => l.node_id));
  return nodes.find((n) => !feitos.has(n.id));
}
