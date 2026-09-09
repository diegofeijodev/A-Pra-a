// Catálogo de cadências — porta literal de `.prototype/src/lib/praca/cadencias.ts`
// e `.prototype/src/lib/praca/cadencias-engine.ts` (AUTO_ENTRIES, MAX_ENROLL_PER_TICK).

import { SEED_TEMPLATE_IDS } from './messages';

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

// ── cadências que já vêm montadas ────────────────────────────
// Porta de `.prototype/src/lib/praca/cadencias.ts:145-219` (`seedCadences`):
// nomes, público, regra de entrada, trilha, saída e TEXTOS iguais, sem
// "melhorar" copy. `tpl-N` do protótipo → `SEED_TEMPLATE_IDS[N-1]`.
//
// UMA diferença deliberada: aqui elas nascem **pausadas** (`paused: true`), e no
// protótipo nasciam ligadas. Lá o relógio rodava na aba aberta de uma demo com
// 25 leads; aqui é um `@Cron` no servidor sobre a base de verdade — ligadas, a
// primeira rodada matricularia todo lead na etapa 1 e todo lead que rodou a
// primeira vaga, marcando mensagem como enviada na ficha de gente real, sem
// ninguém ter pedido. Ligar cada uma é ato de gente (o botão play da tela).
//
// Vive no catálogo (e não no seed) porque duas coisas leem a mesma lista: o
// `prisma/seed-data/cadences.ts`, no primeiro boot, e o
// `POST /v1/cadences/restore-seed`, quando o time apaga uma e quer de volta.

export interface SeedCadenceNode {
  kind: 'msg' | 'task' | 'cond';
  day: number;
  channel?: string;
  template_id?: string;
  text?: string;
  task?: string;
  rule?: string;
  action?: string;
  note?: string;
}

export interface SeedCadence {
  name: string;
  audience: string;
  entry: string;
  exit_action: string;
  exit_note: string;
  paused: boolean;
  nodes: SeedCadenceNode[];
}

const msg = (day: number, tplIndex: number, channel = 'whatsapp'): SeedCadenceNode => ({
  kind: 'msg',
  day,
  channel,
  template_id: SEED_TEMPLATE_IDS[tplIndex - 1],
});

const own = (day: number, text: string, channel = 'whatsapp'): SeedCadenceNode => ({
  kind: 'msg',
  day,
  channel,
  text,
});

const task = (day: number, t: string): SeedCadenceNode => ({ kind: 'task', day, task: t });

const cond = (rule: string, action: string): SeedCadenceNode => ({ kind: 'cond', day: 0, rule, action });

export const SEED_CADENCES: SeedCadence[] = [
  {
    name: 'Prospecção de contratante — 3 toques',
    audience: 'contratante',
    entry: 'stage_novo',
    paused: true,
    exit_action: 'reaquecer_30',
    exit_note:
      'Quem chegou ao fim sem responder sai com despedida educada e volta para a fila de reaquecimento em 30 dias.',
    nodes: [
      msg(0, 1),
      cond('respondeu', 'sai_conversa'),
      msg(2, 2),
      cond('respondeu', 'sai_conversa'),
      task(5, 'Ligar para o dono do lead — toque 3 é ligação, não mensagem'),
      cond('respondeu', 'sai_conversa'),
      own(
        9,
        '{{primeiro_nome_dono}}, vou parar de te incomodar por aqui. Se um dia faltar gente no {{estabelecimento}}, meu número fica salvo — resolvemos em poucas horas. Abraço!',
      ),
    ],
  },
  {
    name: 'Reativação de freelancer da praça',
    audience: 'freelancer',
    entry: 'praca_mapeamento',
    paused: true,
    exit_action: 'fila_confirmacao',
    exit_note: 'Quem responder vai para a fila de ligação de confirmação.',
    nodes: [
      msg(0, 6),
      cond('respondeu', 'fila_confirmacao'),
      own(
        2,
        '{{nome}}, reenviando simplificado: vagas de {{funcao}} em {{cidade}} a partir de {{data}}. Está disponível? Responde SIM.',
      ),
      cond('respondeu', 'fila_confirmacao'),
      task(4, 'Ligar para o freelancer e confirmar disponibilidade'),
    ],
  },
  {
    name: 'Recontratação em 30 dias',
    audience: 'contratante',
    entry: 'first_vaga',
    paused: true,
    exit_action: 'fecha_conta',
    exit_note: 'No dia 30 fecha a conta e registra o resultado (voltou ou não voltou).',
    nodes: [
      msg(1, 4),
      cond('abriu_vaga', 'sai'),
      own(
        7,
        '{{primeiro_nome_dono}}, quer que eu já deixe a próxima vaga marcada para {{dia_forte}}? Mesmo freela, mesmo turno.',
      ),
      cond('abriu_vaga', 'sai'),
      task(20, 'Ligação do “o que faltou?” — não é venda, é aprendizado'),
      own(
        30,
        '{{primeiro_nome_dono}}, fechando o ciclo por aqui. Qualquer dia que apertar, chama — a gente resolve no mesmo dia.',
      ),
    ],
  },
  {
    name: 'Reaquecimento',
    audience: 'contratante',
    entry: 'reheat_due',
    paused: true,
    exit_action: 'reaquecer_60',
    exit_note: 'Sai e volta para a fila daqui a mais 60 dias.',
    nodes: [
      own(
        0,
        '{{primeiro_nome_dono}}, novidade aqui em {{cidade}}: mais um bar da região passou a usar a gente todo fim de semana. Vale te mostrar em 40 segundos? {{link_video_caso}}',
      ),
      cond('respondeu', 'sai_conversa'),
      own(
        4,
        '{{primeiro_nome_dono}}, sem problema se não for o momento. Volto a te procurar mais para frente.',
      ),
    ],
  },
  {
    name: 'Boas-vindas do freelancer verificado',
    audience: 'freelancer',
    entry: 'freela_first_turn',
    paused: true,
    exit_action: 'sai',
    exit_note: 'Fim da trilha de boas-vindas — segue recebendo vagas normalmente.',
    nodes: [
      msg(0, 8, 'interno'),
      own(
        3,
        '{{nome}}, dica dos verificados: chegar 10 minutos antes e confirmar o turno no app sobe sua nota — nota alta recebe vaga antes de todo mundo.',
        'interno',
      ),
      own(
        7,
        '{{nome}}, indique um colega bom: se ele concluir o primeiro turno, vocês dois ganham prioridade nas próximas vagas.',
        'interno',
      ),
    ],
  },
];

/**
 * Os nós de uma cadência-modelo no formato de `cadence_nodes`. Uma função só
 * para o seed (`prisma/seed-data/cadences.ts`) e o `restore-seed` gravarem a
 * mesma coisa — duas cópias divergiriam no primeiro ajuste.
 */
export const seedCadenceNodeRows = (c: SeedCadence) =>
  c.nodes.map((n, i) => ({
    sort: i,
    kind: n.kind,
    day: n.day,
    channel: n.channel ?? null,
    template_id: n.template_id ?? null,
    text: n.text ?? null,
    task: n.task ?? null,
    rule: n.rule ?? null,
    action: n.action ?? null,
    note: n.note ?? null,
  }));
