// Catálogo de indicadores — porta literal de `.prototype/src/lib/praca/indicadores.ts`.
// O `owner` do protótipo (id de pessoa) vira `owner_email`: o serviço de
// indicadores (tarefa futura) resolve `owner_id` procurando o usuário por
// e-mail, `null` se não existir.

export type IndKey =
  | 'clientes_ativos'
  | 'recontratacao'
  | 'tempo_preencher'
  | 'falta'
  | 'perda_mensal'
  | 'custo_cliente'
  | 'freelancers'
  | 'leads_novos'
  | 'passagem_etapa'
  | 'taxa_resposta'
  | 'contratos_rede'
  | 'playbook';

export type IndFreq = 'diária' | 'semanal' | 'mensal';
export type IndDir = 'gte' | 'lte';
export type IndSource = 'sistema' | 'manual';
export type IndOwnerEmail = 'diego@praca.local' | 'rebeca@praca.local' | 'mkt@praca.local';

export interface IndDef {
  key: IndKey;
  name: string;
  what: string;
  meta: number;
  meta_label: string;
  unit: string;
  dir: IndDir;
  freq: IndFreq;
  owner_email: IndOwnerEmail;
  source: IndSource;
  origem: string;
  /** entra nos seis números grandes da visão Empresa */
  hero?: boolean;
}

export const IND_CATALOG: IndDef[] = [
  {
    key: 'clientes_ativos',
    name: 'Clientes ativos no mês',
    what: 'Quantos estabelecimentos abriram vaga e recontrataram dentro de 30 dias.',
    meta: 500,
    meta_label: '500 em dez/26',
    unit: '',
    dir: 'gte',
    freq: 'mensal',
    owner_email: 'rebeca@praca.local',
    source: 'sistema',
    origem: 'funil',
    hero: true,
  },
  {
    key: 'recontratacao',
    name: 'Recontratação em 30 dias',
    what: 'De quem rodou a primeira vaga, quantos voltaram a contratar em 30 dias.',
    meta: 50,
    meta_label: '≥ 50%',
    unit: '%',
    dir: 'gte',
    freq: 'mensal',
    owner_email: 'rebeca@praca.local',
    source: 'sistema',
    origem: 'funil',
    hero: true,
  },
  {
    key: 'tempo_preencher',
    name: 'Tempo até preencher a vaga',
    what: 'Horas entre a vaga publicada e o freelancer confirmado.',
    meta: 4,
    meta_label: '< 4 horas',
    unit: 'h',
    dir: 'lte',
    freq: 'semanal',
    owner_email: 'rebeca@praca.local',
    source: 'sistema',
    origem: 'aplicativo Freela',
    hero: true,
  },
  {
    key: 'falta',
    name: 'Falta',
    what: 'Percentual de turnos em que o freelancer não apareceu.',
    meta: 3,
    meta_label: '≤ 3%',
    unit: '%',
    dir: 'lte',
    freq: 'semanal',
    owner_email: 'rebeca@praca.local',
    source: 'manual',
    origem: 'aplicativo Freela',
    hero: true,
  },
  {
    key: 'perda_mensal',
    name: 'Perda mensal de clientes',
    what: 'Quanto da base de clientes ativos saiu no período.',
    meta: 5,
    meta_label: '≤ 5%',
    unit: '%',
    dir: 'lte',
    freq: 'mensal',
    owner_email: 'rebeca@praca.local',
    source: 'sistema',
    origem: 'funil',
    hero: true,
  },
  {
    key: 'custo_cliente',
    name: 'Custo por cliente ativado',
    what: 'Verba de mídia dividida pelos clientes que viraram ativos.',
    meta: 130,
    meta_label: 'teto R$ 130',
    unit: 'R$',
    dir: 'lte',
    freq: 'semanal',
    owner_email: 'mkt@praca.local',
    source: 'sistema',
    origem: 'campanhas + funil',
    hero: true,
  },
  {
    key: 'freelancers',
    name: 'Freelancers confirmados por função',
    what: 'Garçons, cozinheiros, churrasqueiros e motoboys confirmados por telefone.',
    meta: 40,
    meta_label: '40/12/10/15',
    unit: '',
    dir: 'gte',
    freq: 'semanal',
    owner_email: 'rebeca@praca.local',
    source: 'manual',
    origem: 'praça',
  },
  {
    key: 'leads_novos',
    name: 'Leads novos no mês',
    what: 'Quantos contratantes entraram na base no período.',
    meta: 60,
    meta_label: 'por praça',
    unit: '',
    dir: 'gte',
    freq: 'mensal',
    owner_email: 'rebeca@praca.local',
    source: 'sistema',
    origem: 'entrada de leads',
  },
  {
    key: 'passagem_etapa',
    name: 'Taxa de passagem por etapa do funil',
    what: 'Dos leads tocados, quantos chegaram a cadastrado ou além.',
    meta: 25,
    meta_label: 'acompanhar',
    unit: '%',
    dir: 'gte',
    freq: 'semanal',
    owner_email: 'rebeca@praca.local',
    source: 'sistema',
    origem: 'funil',
  },
  {
    key: 'taxa_resposta',
    name: 'Taxa de resposta das mensagens',
    what: 'Das mensagens enviadas, quantas foram respondidas.',
    meta: 15,
    meta_label: '≥ 15%',
    unit: '%',
    dir: 'gte',
    freq: 'semanal',
    owner_email: 'mkt@praca.local',
    source: 'sistema',
    origem: 'mensagens',
  },
  {
    key: 'contratos_rede',
    name: 'Contratos de rede assinados',
    what: 'Lojas de rede com contrato assinado.',
    meta: 450,
    meta_label: '450 lojas até 31/10',
    unit: '',
    dir: 'gte',
    freq: 'mensal',
    owner_email: 'diego@praca.local',
    source: 'manual',
    origem: 'funil',
  },
  {
    key: 'playbook',
    name: 'Ações do playbook em dia',
    what: 'Percentual das ações vencidas que já foram concluídas.',
    meta: 100,
    meta_label: '100%',
    unit: '%',
    dir: 'gte',
    freq: 'semanal',
    owner_email: 'diego@praca.local',
    source: 'sistema',
    origem: 'abertura de praça',
  },
];

export const FREQ_DAYS: Record<string, number> = { diária: 1, semanal: 7, mensal: 31 };

// ── metas por horizonte ─────────────────────────────────────────
export interface MilestoneTarget {
  name: string;
  meta: number;
  unit: string;
  key: IndKey;
  dir: IndDir;
}

export interface Milestone {
  when: string;
  label: string;
  targets: MilestoneTarget[];
}

export const MILESTONES: Milestone[] = [
  {
    when: '2026-12-31',
    label: 'dez/26',
    targets: [{ name: 'clientes ativos', meta: 500, unit: '', key: 'clientes_ativos', dir: 'gte' }],
  },
  {
    when: '2027-02-28',
    label: 'fev/27',
    targets: [
      { name: 'clientes ativos', meta: 630, unit: '', key: 'clientes_ativos', dir: 'gte' },
      { name: 'perda mensal', meta: 5, unit: '%', key: 'perda_mensal', dir: 'lte' },
    ],
  },
  {
    when: '2027-08-31',
    label: 'ago/27',
    targets: [
      { name: 'clientes ativos', meta: 1000, unit: '', key: 'clientes_ativos', dir: 'gte' },
      { name: 'profissionais responsivos', meta: 60000, unit: '', key: 'freelancers', dir: 'gte' },
    ],
  },
];

// ── visão canal ──────────────────────────────────────────────────
export interface CanalDef {
  id: string;
  label: string;
  match: string[];
}

export const CANAIS: CanalDef[] = [
  { id: 'prospeccao', label: 'Prospecção ativa', match: ['prospecção', 'importação', 'lista'] },
  { id: 'trafego', label: 'Tráfego pago', match: ['tráfego', 'anúncio', 'formulário'] },
  { id: 'indicacao', label: 'Indicação', match: ['indicação'] },
  { id: 'organico', label: 'Orgânico', match: ['orgânico', 'instagram', 'site'] },
  { id: 'evento', label: 'Evento', match: ['evento', 'feira'] },
  { id: 'rede', label: 'Rede', match: ['rede', 'contrato'] },
];

// ── período ───────────────────────────────────────────────────────
export type PeriodId = 'hoje' | 'semana' | 'mes' | 'd90' | 'livre';

export interface PeriodDef {
  id: PeriodId;
  label: string;
}

export const PERIODS: PeriodDef[] = [
  { id: 'hoje', label: 'hoje' },
  { id: 'semana', label: 'esta semana' },
  { id: 'mes', label: 'este mês' },
  { id: 'd90', label: 'últimos 90 dias' },
  { id: 'livre', label: 'período livre' },
];
