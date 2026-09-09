// Catálogo de mídia/campanhas — porta literal de `.prototype/src/lib/praca/campanhas.ts`.
// Chaves internas do protótipo em camelCase (`ctaBotao`) viram snake_case no
// wire (`cta_botao`).

export interface OpcaoDef {
  id: string;
  label: string;
}

export interface ObjetivoDef extends OpcaoDef {
  short: string;
}

export const OBJETIVOS: ObjetivoDef[] = [
  { id: 'cadastro_contratante', label: 'Cadastro de contratante', short: 'Cadastro' },
  { id: 'cadastro_freelancer', label: 'Cadastro de freelancer', short: 'CadFreela' },
  { id: 'primeira_vaga', label: 'Primeira vaga', short: 'PrimeiraVaga' },
  { id: 'reativacao', label: 'Reativação', short: 'Reativacao' },
  { id: 'marca', label: 'Marca', short: 'Marca' },
];

export const DESTINOS: OpcaoDef[] = [
  { id: 'formulario', label: 'Formulário de captura da praça' },
  { id: 'whatsapp', label: 'Conversa no WhatsApp' },
  { id: 'loja', label: 'Loja do aplicativo' },
];

export const FORMATOS: OpcaoDef[] = [
  { id: 'carrossel', label: 'Carrossel' },
  { id: 'story', label: 'Story' },
  { id: 'reels', label: 'Reels' },
  { id: 'video_ia', label: 'Vídeo com IA' },
  { id: 'imagem', label: 'Imagem estática' },
  { id: 'texto', label: 'Texto de anúncio' },
];

export const CREATIVE_STATUS: OpcaoDef[] = [
  { id: 'a_fazer', label: 'A fazer' },
  { id: 'producao', label: 'Em produção' },
  { id: 'aprovacao', label: 'Em aprovação' },
  { id: 'aprovado', label: 'Aprovado' },
  { id: 'publicado', label: 'Publicado' },
  { id: 'pausado', label: 'Pausado' },
];

export const CAMPANHA_STATUS = ['rascunho', 'ativa', 'pausada', 'encerrada'] as const;

export const IA_TOOLS = ['Sora', 'Veo', 'Runway', 'Kling', 'Midjourney', 'Nano Banana', 'outra'];

export const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export interface ScriptModelRoteiro {
  gancho: string;
  desenvolvimento: string;
  prova: string;
  cta: string;
}

export interface ScriptModel {
  id: string;
  name: string;
  formato: string;
  publico: string;
  titulo: string;
  gancho: string;
  roteiro: ScriptModelRoteiro;
  legenda: string;
  cta_botao: string;
  aviso?: string;
}

export const SCRIPT_MODELS: ScriptModel[] = [
  {
    id: 'sm-carrossel',
    name: 'Carrossel — prova social do dono',
    formato: 'carrossel',
    publico: 'contratante',
    titulo: 'Prova social do dono',
    gancho: 'Capa: “Sábado lotado e faltou garçom.”',
    roteiro: {
      gancho: 'Capa com a dor: sábado cheio, dois garçons faltaram.',
      desenvolvimento:
        'O problema em números: 1 falta por semana, fila na porta, comanda atrasada, cliente indo embora. Como resolveu: abriu a vaga no aplicativo e o freela chegou no mesmo turno.',
      prova: 'Depoimento do dono em vídeo/print, com nome do bar e da cidade.',
      cta: 'Oferta + chamada: primeira contratação sem taxa. Toque em “Saiba mais” e cadastre o seu bar.',
    },
    legenda:
      'Faltou gente no sábado? A gente resolve no mesmo dia, com freela avaliado da sua região. Primeira contratação sem taxa.',
    cta_botao: 'Saiba mais',
  },
  {
    id: 'sm-reels',
    name: 'Reels — o dia do dono',
    formato: 'reels',
    publico: 'contratante',
    titulo: 'O dia do dono',
    gancho: '3 primeiros segundos: “Sábado, 19h, faltou garçom.”',
    roteiro: {
      gancho: 'Sábado, 19h, faltou garçom — a casa enchendo.',
      desenvolvimento:
        'O que ele fazia antes: ligava para conhecido, pedia favor, virava o turno na correria. A vaga preenchida em 4 horas pelo aplicativo.',
      prova: 'O turno rodando: freela atendendo, dono falando em uma frase que deu certo.',
      cta: 'Chamada: abra a sua primeira vaga hoje, sem taxa.',
    },
    legenda:
      'De “vou ter que virar o turno” para “já tem gente chegando”. Abra a vaga e receba freela avaliado da sua região.',
    cta_botao: 'Abrir vaga',
  },
  {
    id: 'sm-story',
    name: 'Story — vaga do dia',
    formato: 'story',
    publico: 'freelancer',
    titulo: 'Vaga do dia',
    gancho: 'Primeira linha: “Vaga hoje: garçom, centro, turno da noite.”',
    roteiro: {
      gancho: 'Vaga de hoje na sua cidade.',
      desenvolvimento:
        'Função, local e horário do turno. Valor combinado do turno, pagamento garantido pelo aplicativo.',
      prova: 'Freela verificado contando como foi o último turno.',
      cta: 'Arraste para cima, faça o cadastro e pegue a vaga.',
    },
    legenda: 'Vaga aberta hoje: garçom · centro · turno da noite. Valor do turno combinado e pagamento garantido.',
    cta_botao: 'Cadastrar',
    aviso: 'Fale de vagas disponíveis e pagamento garantido. Nunca prometa renda mensal.',
  },
  {
    id: 'sm-video-ia',
    name: 'Vídeo com IA — explicação do produto',
    formato: 'video_ia',
    publico: 'contratante',
    titulo: 'Como funciona em 3 passos',
    gancho: '“Falta de gente no turno tem solução em horas.”',
    roteiro: {
      gancho: 'O que é: um aplicativo que preenche o turno que ficou vago.',
      desenvolvimento:
        'Para quem: bar, restaurante, hotel, buffet e casa de evento. Como funciona em 3 passos: abre a vaga · o freela avaliado aceita · você aprova e ele chega no turno.',
      prova: 'Números da região: turnos rodados e tempo médio de preenchimento.',
      cta: 'Cadastre o seu estabelecimento e abra a primeira vaga sem taxa.',
    },
    legenda: 'Abra a vaga, escolha o freela avaliado, o turno roda. Simples assim.',
    cta_botao: 'Cadastrar estabelecimento',
  },
  {
    id: 'sm-capta-freela',
    name: 'Anúncio de captação de freelancer',
    formato: 'texto',
    publico: 'freelancer',
    titulo: 'Captação de freelancer',
    gancho: 'Primeira linha: “Tem vaga de garçom aberta na sua cidade esta semana.”',
    roteiro: {
      gancho: 'Vagas abertas nesta semana na sua cidade.',
      desenvolvimento:
        'Funções: garçom, cozinheiro, churrasqueiro e motoboy. Você escolhe o turno que quer pegar. Valor do turno combinado antes, pagamento garantido pelo aplicativo.',
      prova: 'Freelancers verificados que já rodaram turnos na região.',
      cta: 'Faça o cadastro e veja as vagas da semana.',
    },
    legenda:
      'Vagas abertas na sua cidade nesta semana. Turno combinado antes e pagamento garantido. Você escolhe o que pegar.',
    cta_botao: 'Ver vagas',
    aviso:
      'Cuidado redobrado: falar de vagas disponíveis e pagamento garantido do turno. Nunca prometer quanto a pessoa vai ganhar por mês.',
  },
];

export const PROOF_KIND_LABEL: Record<string, string> = {
  video_dono: 'vídeo de dono',
  video_freela: 'vídeo de freelancer',
  caso: 'caso escrito',
};

// ── portões do playbook (freio de mídia) ───────────────────────
export const GATE_WARNING =
  'Esta praça ainda não bateu o portão de recontratação. Mídia antes disso multiplica o problema.';

export const FILL_ALERT =
  'Preenchimento acima de 4 horas. Corte a mídia e volte para a captação de freelancer.';
