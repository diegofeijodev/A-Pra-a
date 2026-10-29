import { diaCurto } from '@/modules/planos/domain/planos';
import { TIPOS_TAREFA, type ResumoCrmView, type TipoTarefa } from '../infrastructure/crm.api';
import { horaDita } from './automacoes';
import { linhasDoResumo, somaDasTarefas } from './tarefas';

/**
 * Cartão "Comercial hoje" do Dashboard (UX §3.3): três números do DIA (não do período do Dashboard), cada um com a conta e a fonte.
 * Funções puras; o relógio entra por parâmetro.
 */

export interface LinhaCartao {
  chave: 'tarefas' | 'leads_novos' | 'mudancas_etapa';
  rotulo: string;
  /** `null` = ainda não deu para contar (carregando ou erro). */
  numero: string;
  conta: string;
}

export const TITULO_CARTAO = 'Comercial hoje';
export const SEM_PERIODO = 'não segue o período acima';

/**
 * "qua 28/10 · todas as praças · não segue o período acima". O aviso do período só onde há um seletor de período acima (o painel do
 * gestor); na `/inicio` sem o painel não há período nenhum.
 */
export const subtituloDoCartao = (dia: string, pracaNome: string | null, comPeriodo: boolean): string =>
  `${diaCurto(dia)} · ${pracaNome ?? 'todas as praças'}${comPeriodo ? ` · ${SEM_PERIODO}` : ''}`;

export type EstadoCartao = 'carregando' | 'erro' | 'pronto';

/**
 * Número só com tudo lido (a lista de praças, o resumo e as tarefas de cada praça). Sem a lista de praças nenhuma consulta de tarefas
 * sai, e a soma vazia viraria um "0 · Nenhuma tarefa para hoje." falso. Lido uma vez, uma releitura que falhou não apaga os números.
 */
export function estadoDoCartao(p: {
  pracas: { pronta: boolean; erro: boolean };
  resumo: { pronto: boolean; erro: boolean };
  tarefas: { pronta: boolean; erro: boolean }[];
}): EstadoCartao {
  if (p.pracas.pronta && p.resumo.pronto && p.tarefas.every((t) => t.pronta)) return 'pronto';
  if (p.pracas.erro || p.resumo.erro || p.tarefas.some((t) => t.erro)) return 'erro';
  return 'carregando';
}

/** Soma os grupos de várias praças (uma consulta de Tarefas por praça) numa lista só. */
export function somarGrupos(listas: { task: TipoTarefa; total: number }[][]): { task: TipoTarefa; total: number }[] {
  const por = new Map<TipoTarefa, number>();
  for (const l of listas) for (const g of l) por.set(g.task, (por.get(g.task) ?? 0) + g.total);
  return TIPOS_TAREFA.filter((t) => por.has(t)).map((task) => ({ task, total: por.get(task)! }));
}

/** A linha de Tarefas: "Todas" as pessoas (o Dashboard é a visão geral). */
export function linhaDeTarefas(grupos: { task: TipoTarefa; total: number }[]): LinhaCartao {
  const { total, partes } = somaDasTarefas(grupos);
  return {
    chave: 'tarefas',
    rotulo: 'Tarefas para hoje',
    numero: total.toLocaleString('pt-BR'),
    conta: total === 0 ? 'Nenhuma tarefa para hoje.' : partes,
  };
}

/** Leads novos e Mudanças de etapa, do resumo do dia (a API manda a conta pronta; o zero vira a frase do dia). */
export function linhasDoResumoCartao(r: ResumoCrmView): LinhaCartao[] {
  return linhasDoResumo(r, 'hoje')
    .filter((l) => l.chave === 'leads_novos' || l.chave === 'mudancas_etapa')
    .map((l) => ({ chave: l.chave as LinhaCartao['chave'], rotulo: l.rotulo, numero: l.numero, conta: l.conta }));
}

/** "ⓘ De onde vem". `atualizadoEm` = a leitura mais recente das tarefas. */
export function fonteDoCartao(dia: string, atualizadoEm: Date | null): string {
  const ate = atualizadoEm ? `, às ${horaDita(atualizadoEm)}` : '';
  return (
    `Tarefas: calculadas agora${ate}, pela mesma regra da tela Tarefas, para todas as pessoas. ` +
    `Leads novos e mudanças de etapa: leads criados e eventos de etapa em ${dia.slice(8, 10)}/${dia.slice(5, 7)}, dia de Brasília, sem os de teste.`
  );
}

