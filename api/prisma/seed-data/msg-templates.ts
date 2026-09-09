/**
 * Modelos de mensagem e configurações de envio que já vêm criados.
 *
 * Os 8 modelos são cópia literal de
 * `.prototype/src/lib/praca/mensagens.ts:231-310` (`SEED_TEMPLATES`) — texto
 * igual, sem "melhorar" copy. Os ids são FIXOS (`SEED_TEMPLATE_IDS`) porque as
 * cadências-modelo referenciam modelo por id: no protótipo era `tpl-1`…`tpl-8`,
 * aqui é `…f001`…`…f008`, na mesma ordem.
 *
 * Idempotente: `upsert` por id com `update: {}` — rodar o seed de novo não
 * sobrescreve o texto que o time já ajustou. Mesma coisa para `app_settings`:
 * a linha 1 nasce com `DEFAULT_TEMPLATE_DEFAULTS` e nunca é reescrita.
 */
import { PrismaClient } from '@prisma/client';
import { DEFAULT_TEMPLATE_DEFAULTS } from '../../src/domain/catalog/messages';

/** `tpl-1`…`tpl-8` do protótipo, na mesma ordem. Task 11 (cadências) usa isto. */
export const SEED_TEMPLATE_IDS = [
  '00000000-0000-4000-8000-00000000f001',
  '00000000-0000-4000-8000-00000000f002',
  '00000000-0000-4000-8000-00000000f003',
  '00000000-0000-4000-8000-00000000f004',
  '00000000-0000-4000-8000-00000000f005',
  '00000000-0000-4000-8000-00000000f006',
  '00000000-0000-4000-8000-00000000f007',
  '00000000-0000-4000-8000-00000000f008',
] as const;

interface TemplateSeedRow {
  name: string;
  audience: 'contratante' | 'freelancer';
  stage: number;
  channel: 'whatsapp' | 'email' | 'interno';
  text_a: string;
  text_b: string;
  attachment_kind?: string;
  attachment_name?: string;
}

export const SEED_TEMPLATES: TemplateSeedRow[] = [
  {
    name: 'Contratante · toque 1 (lead novo)',
    audience: 'contratante',
    stage: 1,
    channel: 'whatsapp',
    text_a:
      'Oi {{primeiro_nome_dono}}, tudo bem? Sou {{meu_nome}}, do Freela. A gente resolveu o problema de garçom de fim de semana do {{estabelecimento_vizinho}} aí em {{cidade}} — ele contou nesse vídeo de 40 segundos. Como você resolve quando falta gente no sábado no {{estabelecimento}}?',
    text_b:
      '{{primeiro_nome_dono}}, boa tarde! {{meu_nome}} aqui, do Freela. Bar aqui em {{cidade}} parou de sofrer com falta de garçom no sábado usando a gente — vídeo de 40s: {{link_video_caso}}. No {{estabelecimento}} o aperto é em qual dia?',
    attachment_kind: 'video',
    attachment_name: 'caso-40s.mp4',
  },
  {
    name: 'Contratante · toque 2 (sem resposta)',
    audience: 'contratante',
    stage: 2,
    channel: 'whatsapp',
    text_a:
      '{{primeiro_nome_dono}}, passando de novo rapidinho. A primeira contratação é sem taxa e a gente acompanha de perto. Qual é o seu dia mais difícil da semana?',
    text_b:
      '{{primeiro_nome_dono}}, só confirmando se chegou. Primeira contratação sem taxa e com acompanhamento nosso do começo ao fim. Qual dia costuma apertar mais no {{estabelecimento}}?',
  },
  {
    name: 'Contratante · cadastrado sem vaga',
    audience: 'contratante',
    stage: 5,
    channel: 'whatsapp',
    text_a:
      '{{primeiro_nome_dono}}, vi que você já está cadastrado mas ainda não abriu vaga. Quer que eu abra a primeira junto com você agora, por telefone? Leva 5 minutos.',
    text_b:
      '{{primeiro_nome_dono}}, seu cadastro está pronto e sem vaga aberta. Te ligo agora e abrimos a primeira juntos em 5 minutos — pode ser?',
  },
  {
    name: 'Contratante · dia 7 depois da primeira vaga',
    audience: 'contratante',
    stage: 6,
    channel: 'whatsapp',
    text_a:
      'E aí {{primeiro_nome_dono}}, como foi o turno? Já quer deixar a próxima marcada? Costuma ser {{dia_forte}} o seu dia cheio.',
    text_b:
      '{{primeiro_nome_dono}}, como foi o turno com a gente? Se quiser eu já deixo {{dia_forte}} reservado com o mesmo freela.',
  },
  {
    name: 'Contratante · dia 20 sem segunda vaga',
    audience: 'contratante',
    stage: 6,
    channel: 'whatsapp',
    text_a:
      '{{primeiro_nome_dono}}, não é ligação de venda, é de aprendizado mesmo. Você usou a gente uma vez e não voltou — o que faltou para você abrir de novo?',
    text_b: '',
  },
  {
    name: 'Freelancer · reativação de praça',
    audience: 'freelancer',
    stage: 0,
    channel: 'whatsapp',
    text_a:
      'Oi {{nome}}! Aqui é a {{meu_nome}}, do Freela. Vamos abrir vagas em {{cidade}} a partir do dia {{data}} — bares e restaurantes da região. Você trabalha como {{funcao}} e está disponível? Responde SIM que eu te ligo hoje.',
    text_b:
      '{{nome}}, tudo bem? {{meu_nome}} do Freela. Abrimos vagas de {{funcao}} em {{cidade}} a partir de {{data}}. Está disponível? Responde SIM e eu te ligo hoje.',
  },
  {
    name: 'Freelancer · vaga do dia',
    audience: 'freelancer',
    stage: 0,
    channel: 'whatsapp',
    text_a:
      'Vaga hoje em {{cidade}}: {{funcao}}, turno {{turno}}, {{valor}}. Local: {{bairro}}. Pagamento garantido depois do turno. Quem topa responde AQUI.',
    text_b: '',
  },
  {
    name: 'Freelancer · boas-vindas do verificado',
    audience: 'freelancer',
    stage: 0,
    channel: 'interno',
    text_a:
      '{{nome}}, você concluiu seu primeiro turno e entrou no grupo dos verificados. A partir de agora você recebe as vagas antes de todo mundo.',
    text_b: '',
  },
];

export async function seedMsgTemplates(prisma: PrismaClient) {
  for (const [i, t] of SEED_TEMPLATES.entries()) {
    await prisma.msg_templates.upsert({
      where: { id: SEED_TEMPLATE_IDS[i] },
      update: {},
      create: {
        id: SEED_TEMPLATE_IDS[i],
        name: t.name,
        audience: t.audience,
        stage: t.stage,
        channel: t.channel,
        text_a: t.text_a,
        text_b: t.text_b,
        attachment_kind: t.attachment_kind ?? null,
        attachment_name: t.attachment_name ?? null,
      },
    });
  }
  console.log(`✔ Modelos de mensagem: ${SEED_TEMPLATES.length}`);
}

export async function seedAppSettings(prisma: PrismaClient) {
  // `update: {}` — janela, ritmo e valores-padrão são ajuste da operação; o
  // seed só planta a linha se ela ainda não existe.
  await prisma.app_settings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, template_defaults: DEFAULT_TEMPLATE_DEFAULTS },
  });
  console.log('✔ Configurações de envio (app_settings id 1)');
}
