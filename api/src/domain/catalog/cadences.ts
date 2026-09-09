// Catálogo de cadências — porta literal de `.prototype/src/lib/praca/cadencias.ts`
// e `.prototype/src/lib/praca/cadencias-engine.ts` (AUTO_ENTRIES, MAX_ENROLL_PER_TICK).

export interface EntryRuleDef {
  id: string;
  label: string;
}

export const ENTRY_RULES: EntryRuleDef[] = [
  { id: 'stage_novo', label: 'lead entrou na etapa "Lead novo"' },
  { id: 'reheat_due', label: 'lead está há 30 dias na fila de reaquecimento' },
  { id: 'praca_mapeamento', label: 'praça entrou em "Em mapeamento"' },
  { id: 'first_vaga', label: 'cliente rodou a primeira vaga' },
  { id: 'freela_first_turn', label: 'freelancer concluiu o primeiro turno' },
  { id: 'manual', label: 'entrada manual' },
];

export interface CondRuleDef {
  id: string;
  label: string;
}

export const COND_RULES: CondRuleDef[] = [
  { id: 'respondeu', label: 'se respondeu' },
  { id: 'abriu_vaga', label: 'se abriu vaga' },
  { id: 'sem_resposta', label: 'se não respondeu até aqui' },
];

export interface CondActionDef {
  id: string;
  label: string;
}

export const COND_ACTIONS: CondActionDef[] = [
  { id: 'sai_conversa', label: 'sai da cadência e vai para a etapa Conversa aberta' },
  { id: 'sai', label: 'sai da cadência' },
  { id: 'reaquecer_30', label: 'sai e vai para reaquecimento em 30 dias' },
  { id: 'reaquecer_60', label: 'sai e volta para a fila daqui a 60 dias' },
  { id: 'fila_confirmacao', label: 'sai e entra na fila de ligação de confirmação' },
  { id: 'fecha_conta', label: 'fecha a conta e registra o resultado' },
  { id: 'continua', label: 'segue na cadência' },
];

export const EXIT_REASON_LABEL: Record<string, string> = {
  respondeu: 'respondeu',
  abriu_vaga: 'abriu vaga',
  reaquecer_30: 'foi para reaquecimento em 30 dias',
  reaquecer_60: 'voltou para a fila em 60 dias',
  fila_confirmacao: 'foi para a fila de confirmação',
  fecha_conta: 'conta fechada com resultado registrado',
  fim: 'chegou ao fim sem responder',
  bloqueio: 'estava na lista de bloqueio',
  pausada: 'cadência pausada',
  manual: 'retirada manual',
};

// Regras de entrada que o relógio de cadências dispara sozinho (as demais —
// praça/freelancer/manual — entram na mão).
export const AUTO_ENTRIES = ['stage_novo', 'reheat_due', 'first_vaga'] as const;

// Limite de matrículas automáticas por rodada do relógio.
export const MAX_ENROLL_PER_TICK = 30;
