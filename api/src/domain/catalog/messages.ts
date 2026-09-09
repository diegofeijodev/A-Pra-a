// Catálogo de mensagens — porta literal de `.prototype/src/lib/praca/mensagens.ts`.
// `SEND_MODES` no protótipo tinha 3 modos (fila/oficial/provedor); nesta porta
// existem só 2, conforme a brief da tarefa: `fila` (fila manual) e `freela`
// (via sistema de campanhas do Freela, com anti-bloqueio e opt-out automático).

export interface ChannelDef {
  id: string;
  label: string;
}

export const CHANNELS: ChannelDef[] = [
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'email', label: 'E-mail' },
  { id: 'interno', label: 'Mensagem interna' },
];

export interface AudienceDef {
  id: string;
  label: string;
}

export const AUDIENCES: AudienceDef[] = [
  { id: 'contratante', label: 'Contratante' },
  { id: 'freelancer', label: 'Freelancer' },
];

export interface SendModeDef {
  id: 'fila' | 'freela';
  label: string;
  desc: string;
  tone: 'ok' | 'warn' | 'danger';
}

export const SEND_MODES: SendModeDef[] = [
  {
    id: 'fila',
    label: 'Fila manual',
    desc: 'Padrão e recomendado para prospecção fria. O sistema não envia sozinho: monta a fila na tela, você copia, abre a conversa, envia e marca como enviada. Mais lento, não coloca o número em risco.',
    tone: 'ok',
  },
  {
    id: 'freela',
    label: 'Via Freela (número da empresa)',
    desc: 'Sai pelo chip de campanha do Freela, com ritmo anti-bloqueio, janela comercial e opt-out automático ("responda SAIR"). Precisa da conexão com o Freela configurada.',
    tone: 'ok',
  },
];

export type SendMode = SendModeDef['id'];

export const VARIABLES = [
  'nome',
  'estabelecimento',
  'cidade',
  'praca',
  'primeiro_nome_dono',
  'link_video_caso',
  'link_cadastro',
  'funcao',
  'data_vaga',
  'valor',
  'meu_nome',
  'estabelecimento_vizinho',
  'dia_forte',
  'data',
  'turno',
  'bairro',
] as const;

export type TemplateVariable = (typeof VARIABLES)[number];

// Lista de bloqueio: quem responde com uma dessas palavras sai da cadência e
// vai para o blocklist (respeitada pelo motor de cadências, tarefa futura).
export const OPTOUT_WORDS = [
  'pare',
  'parar',
  'sair',
  'não quero',
  'nao quero',
  'para de mandar',
  'descadastrar',
  'me remove',
  'remover',
  'stop',
  'não me mande',
  'nao me mande',
];

// Janela de envio permitida (horas).
export const HARD_MIN = 8;
export const HARD_MAX = 20;

export const DEFAULT_TEMPLATE_DEFAULTS = {
  link_video_caso: 'https://freela.app/casos/bh',
  link_cadastro: 'https://freela.app/cadastro',
  funcao: 'garçom',
  valor: 'R$ 120',
  dia_forte: 'sábado',
  turno: '18h às 00h',
};
