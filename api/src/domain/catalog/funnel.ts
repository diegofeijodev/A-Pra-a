// Funil de leads e importação — porta literal de
// `.prototype/src/lib/praca/funil.ts:11-20,25-41` e
// `.prototype/src/lib/praca/intake.ts:9-20,22-29,258`.

export interface StageDef {
  n: number;
  name: string;
  meaning: string;
  color: string;
}

export const FUNNEL_STAGES: StageDef[] = [
  { n: 1, name: 'Lead novo', meaning: 'Entrou na base e ninguém falou com ele ainda', color: '#6E6B60' },
  { n: 2, name: 'Contatado', meaning: 'Primeiro toque dado, sem resposta ainda', color: '#5A9BC4' },
  { n: 3, name: 'Conversa aberta', meaning: 'Respondeu, existe diálogo', color: '#3E7EA8' },
  { n: 4, name: 'Reunião ou visita marcada', meaning: 'Tem data na agenda', color: '#6B5B8A' },
  { n: 5, name: 'Cadastrado', meaning: 'Está dentro da plataforma, sem vaga ainda', color: '#ECA826' },
  { n: 6, name: 'Primeira vaga rodada', meaning: 'Já contratou uma vez', color: '#C4881A' },
  { n: 7, name: 'Cliente ativo', meaning: 'Recontratou dentro de 30 dias', color: '#3E8E5A' },
  { n: 8, name: 'Perdido / reaquecer', meaning: 'Saiu do processo, com motivo registrado', color: '#B4432E' },
];

export const LOST_REASONS = [
  'preço',
  'não precisa de freelancer',
  'usa gente própria',
  'desconfiança jurídica',
  'não respondeu',
  'fechou o estabelecimento',
  'outro',
] as const;

export interface ClasseDef {
  id: 'grande' | 'alvo' | 'depois';
  label: string;
}

export const CLASSES: ClasseDef[] = [
  { id: 'grande', label: 'casa grande' },
  { id: 'alvo', label: 'alvo' },
  { id: 'depois', label: 'depois' },
];

export const ORIGENS = ['importação', 'tráfego', 'indicação', 'prospecção'] as const;

export const IMPORT_ORIGENS = [
  'importação',
  'tráfego pago',
  'indicação',
  'prospecção ativa',
  'orgânico',
  'evento',
] as const;

export type EventKind = 'msg_out' | 'msg_in' | 'call' | 'visit' | 'stage' | 'note';

export const EVENT_LABEL: Record<EventKind, string> = {
  msg_out: 'Mensagem enviada',
  msg_in: 'Mensagem respondida',
  call: 'Ligação',
  visit: 'Visita',
  stage: 'Mudança de etapa',
  note: 'Nota',
};

export const CONTACT_KINDS: EventKind[] = ['msg_out', 'msg_in', 'call', 'visit'];

export const EST_VALUE: Record<'grande' | 'alvo' | 'depois', number> = {
  grande: 4500,
  alvo: 2200,
  depois: 900,
};

export interface LeadFieldDef {
  id: string;
  label: string;
  hints: string[];
}

export const LEAD_FIELDS: LeadFieldDef[] = [
  {
    id: 'name',
    label: 'Nome do estabelecimento',
    hints: ['nome', 'name', 'estabelecimento', 'titulo', 'title', 'empresa', 'razao', 'fantasia'],
  },
  { id: 'address', label: 'Endereço', hints: ['endereco', 'address', 'rua', 'logradouro', 'street'] },
  { id: 'city', label: 'Cidade', hints: ['cidade', 'city', 'municipio', 'localidade'] },
  {
    id: 'phone',
    label: 'Telefone',
    hints: ['telefone', 'phone', 'fone', 'celular', 'whatsapp', 'whats', 'tel'],
  },
  { id: 'instagram', label: 'Instagram', hints: ['instagram', 'insta', 'ig', 'perfil'] },
  {
    id: 'decisor',
    label: 'Decisor',
    hints: ['decisor', 'responsavel', 'contato', 'dono', 'proprietario', 'gerente', 'owner'],
  },
  {
    id: 'classe',
    label: 'Classificação',
    hints: ['classificacao', 'classe', 'porte', 'categoria', 'tipo', 'class'],
  },
  { id: 'origem', label: 'Origem', hints: ['origem', 'fonte', 'source', 'canal'] },
  { id: 'cnpj', label: 'CNPJ', hints: ['cnpj', 'documento', 'doc'] },
  // Bloco B (§21.3): base de estabelecimentos para as rotas.
  { id: 'cnae', label: 'CNAE', hints: ['cnae', 'cnaefiscal', 'atividade'] },
  { id: 'bairro', label: 'Bairro', hints: ['bairro', 'distrito', 'neighborhood'] },
  { id: 'lat', label: 'Latitude', hints: ['latitude'] },
  { id: 'lng', label: 'Longitude', hints: ['longitude', 'lng'] },
];

export const CLASSE_ORDER: Record<string, number> = { grande: 0, alvo: 1, depois: 2 };
