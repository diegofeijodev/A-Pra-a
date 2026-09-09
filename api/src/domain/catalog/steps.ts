// Roteiro-modelo (playbook) de abertura de praça — porta literal de
// `.prototype/src/lib/praca/template.ts:9-21`. Conteúdo estático, não vem do
// banco (ver CLAUDE.md § "Onde fica o conteúdo").

export type StepBlock = 'Preparar' | 'Começar' | 'Provar' | 'Crescer' | 'Fixas';

export interface StepGate {
  target: number;
  dir: 'gte' | 'lte';
  label: string;
}

export interface StepDef {
  n: number;
  name: string;
  block: StepBlock;
  expected: string;
  gate?: StepGate;
}

export const STEPS: StepDef[] = [
  {
    n: 1,
    name: 'Mapear a região',
    block: 'Preparar',
    expected: '200 estabelecimentos no CRM e 15 casas grandes com o nome do dono.',
  },
  {
    n: 2,
    name: 'Ter freelancer pronto para trabalhar',
    block: 'Preparar',
    expected:
      '40 garçons, 12 cozinheiros, 10 churrasqueiros e 15 motoboys confirmados por telefone.',
    gate: { target: 40, dir: 'gte', label: '40 garçons confirmados' },
  },
  {
    n: 3,
    name: 'Fechar os 10 primeiros PDVs',
    block: 'Começar',
    expected: '10 clientes fechados, sendo 3 casas grandes, todos com a primeira vaga marcada.',
  },
  {
    n: 4,
    name: 'Rodar as primeiras vagas com o time em cima',
    block: 'Começar',
    expected:
      '20 turnos concluídos, falta em no máximo 1 a cada 20, preenchimento em menos de 4 horas e nota acima de 4,5.',
  },
  {
    n: 5,
    name: 'Colher provas sociais dos dois lados',
    block: 'Provar',
    expected: '5 vídeos de donos, 5 de freelancers e 3 casos escritos.',
  },
  {
    n: 6,
    name: 'Trazer os 10 de volta em 30 dias',
    block: 'Provar',
    expected: '5 dos 10 clientes abriram a segunda vaga.',
    gate: { target: 5, dir: 'gte', label: '5 clientes com segunda vaga' },
  },
  {
    n: 7,
    name: 'Vender para a lista inteira',
    block: 'Crescer',
    expected: '100% da lista tocada, 30 clientes novos cadastrados e 15 com vaga rodada.',
  },
  {
    n: 8,
    name: 'Aumentar a base de freelancer',
    block: 'Crescer',
    expected: '3 freelancers confirmados para cada vaga da semana, em cada função.',
  },
  {
    n: 9,
    name: 'Ligar o programa de indicação',
    block: 'Crescer',
    expected: 'Programa no ar e 1 a 2 de cada 10 cadastros novos vindos de indicação.',
  },
  {
    n: 10,
    name: 'Ligar o tráfego na região',
    block: 'Crescer',
    expected: 'Custo por cliente novo dentro do teto e vaga ainda preenchendo em menos de 4 horas.',
    gate: { target: 130, dir: 'lte', label: 'CAC abaixo de R$ 130' },
  },
  {
    n: 11,
    name: 'Conferir se a praça está rodando',
    block: 'Crescer',
    expected:
      '30 clientes ativos, metade recontratando em 30 dias, vaga em menos de 4 horas e um responsável nomeado.',
  },
];

// Etapas com portão: etapa -> etapa anterior que a libera.
export const GATED_BY: Record<number, number> = { 3: 2, 7: 6, 11: 10 };

export const STEP_BLOCKS: StepBlock[] = ['Preparar', 'Começar', 'Provar', 'Crescer', 'Fixas'];

// Freio automático de mídia: acima disso, corta tráfego (campanhas.ts).
export const FILL_LIMIT_H = 4;
