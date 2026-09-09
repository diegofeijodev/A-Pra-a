/**
 * Roteiro-modelo (playbook) de abertura de praça — as 84 ações-modelo do
 * protótipo (`.prototype/src/lib/praca/template.ts:34-138`), copiadas na
 * ordem, com os nomes de campo em snake_case do banco.
 *
 * Aqui é SEED (linhas de `template_actions`), não catálogo: o time edita o
 * roteiro pelo `/v1/template-actions`, então o upsert é por `key` com
 * `update: {}` — rodar o seed de novo não desfaz edição nenhuma.
 */
import { PrismaClient } from '@prisma/client';
import { recToRow, type Rec } from '../../src/domain/recurrence';
import { SEED_USER_IDS } from '../seed';

type Owner = keyof typeof SEED_USER_IDS;

export interface TemplateActionSeed {
  key: string;
  step: number;
  title: string;
  owners: Owner[];
  rec: Rec;
  tools?: string[];
  how_to?: string[];
  expected?: string;
  msg?: string;
  attention?: string;
  expects_result?: boolean;
}

// Mesma assinatura do helper `t` do protótipo, para a lista abaixo continuar
// na mesma ordem e com os mesmos argumentos de `template.ts`.
const t = (
  key: string,
  step: number,
  title: string,
  owners: Owner[],
  rec: Rec,
  extra: Partial<TemplateActionSeed> = {},
): TemplateActionSeed => ({ key, step, title, owners, rec, ...extra });

export const TEMPLATE_ACTIONS: TemplateActionSeed[] = [
  // ── Etapa 1 — Mapear a região
  t(
    's1a1',
    1,
    'Desenhar no mapa a área que vamos atender (6 a 10 km do bolsão de bares)',
    ['daniel'],
    { kind: 'once', day: 2 },
    {
      tools: ['Google Maps'],
      how_to: [
        'Abrir o Google Maps centrado no bolsão de bares da cidade',
        'Desenhar o polígono de 6 a 10 km ao redor',
        'Salvar o mapa e anexar no CRM',
      ],
    },
  ),
  t('s1a2', 1, 'Aprovar a área desenhada', ['diego'], { kind: 'once', day: 3 }),
  t(
    's1a3',
    1,
    'Levantar no Google Maps e Instagram todos os bares, restaurantes, hotéis e buffets da área',
    ['daniel'],
    { kind: 'once', day: 6 },
    { tools: ['Google Maps', 'Instagram'] },
  ),
  t(
    's1a4',
    1,
    'Classificar a lista em casa grande, alvo e depois',
    ['daniel'],
    { kind: 'once', day: 7 },
    { tools: ['CRM'] },
  ),
  t(
    's1a5',
    1,
    'Subir a lista completa no CRM com a etiqueta da praça',
    ['daniel'],
    { kind: 'once', day: 8 },
    { tools: ['CRM'] },
  ),
  t('s1a6', 1, 'Escolher as 5 casas grandes que vão receber visita', ['diego'], { kind: 'once', day: 8 }),

  // ── Etapa 2 — Ter freelancer pronto (portão)
  t(
    's2a1',
    2,
    'Puxar da base os cadastros da área, separados por função',
    ['daniel'],
    { kind: 'once', day: 3 },
    { tools: ['CRM', 'Aplicativo Freela'] },
  ),
  t(
    's2a2',
    2,
    'Escrever e aprovar o texto do disparo de reativação (com data e cidade)',
    ['mkt'],
    { kind: 'once', day: 4 },
    {
      tools: ['WhatsApp Business'],
      msg: 'Oi, {nome}! A Freela está chegando em {cidade} com vagas pagas por turno em bares e restaurantes. Sua ficha está ativa — quer receber as vagas desta semana? Responde SIM aqui.',
    },
  ),
  t(
    's2a3',
    2,
    'Disparar a reativação em lotes de 300 por dia',
    ['mkt'],
    { kind: 'weekday', start_day: 5, end_day: 12 },
    {
      tools: ['WhatsApp Business'],
      attention: 'Não dispare a base inteira de uma vez: lotes de 300 evitam bloqueio do número.',
    },
  ),
  t(
    's2a4',
    2,
    'Ligar em quem respondeu e confirmar função, turno e disponibilidade',
    ['daniel'],
    { kind: 'weekday', start_day: 6, end_day: 14 },
    { tools: ['CRM'] },
  ),
  t(
    's2a5',
    2,
    'Completar o perfil de cada confirmado (função, foto e documento)',
    ['daniel'],
    { kind: 'once', day: 14 },
    { tools: ['Aplicativo Freela'] },
  ),
  t(
    's2a6',
    2,
    'Criar o grupo da praça no WhatsApp e publicar as regras',
    ['daniel'],
    { kind: 'once', day: 10 },
    { tools: ['WhatsApp Business'] },
  ),
  t(
    's2a7',
    2,
    'Fechar a folha da praça com o total confirmado por função',
    ['daniel'],
    { kind: 'once', day: 14 },
    { expects_result: true, expected: 'Total confirmado por função lançado na folha da praça' },
  ),
  t('s2a8', 2, 'Conferir o portão e liberar (ou não) a etapa 3', ['diego'], { kind: 'once', day: 15 }),

  // ── Etapa 3 — Fechar os 10 primeiros PDVs
  t(
    's3a1',
    3,
    'Estudar as 5 casas grandes antes da visita (unidades, eventos, mesas)',
    ['diego'],
    { kind: 'once', day: 16 },
    { tools: ['Google Maps', 'Instagram'] },
  ),
  t('s3a2', 3, 'Visitar presencialmente as 5 casas grandes', ['diego'], {
    kind: 'weekday',
    start_day: 17,
    end_day: 24,
  }),
  t(
    's3a3',
    3,
    'Fechar 5 clientes da lista alvo por telefone e reunião on-line',
    ['daniel'],
    { kind: 'weekday', start_day: 18, end_day: 26 },
    { tools: ['CRM'] },
  ),
  t(
    's3a4',
    3,
    'Confirmar por escrito a data da primeira vaga de cada cliente fechado',
    ['daniel'],
    { kind: 'once', day: 27 },
    { tools: ['WhatsApp Business'] },
  ),
  t(
    's3a5',
    3,
    'Registrar os 10 clientes no CRM com data, função e turno',
    ['daniel'],
    { kind: 'once', day: 28 },
    { tools: ['CRM'] },
  ),
  t('s3a6', 3, 'Montar a agenda das 10 primeiras vagas e travar na agenda do time', ['daniel'], {
    kind: 'once',
    day: 28,
  }),

  // ── Etapa 4 — Rodar as primeiras vagas
  t(
    's4a1',
    4,
    'Abrir a primeira vaga junto com cada cliente, por telefone ou no local',
    ['daniel'],
    { kind: 'weekday', start_day: 20, end_day: 35 },
    { tools: ['Aplicativo Freela'] },
  ),
  t(
    's4a2',
    4,
    'Escolher a dedo o freelancer de cada uma das 20 primeiras vagas',
    ['daniel'],
    { kind: 'weekday', start_day: 20, end_day: 35 },
    {
      tools: ['Aplicativo Freela'],
      attention: 'Nas 20 primeiras vagas não vale escala automática: cada freelancer é escolhido a dedo.',
    },
  ),
  t(
    's4a3',
    4,
    'Confirmar cada freelancer 24 horas antes e 3 horas antes',
    ['daniel'],
    { kind: 'daily', start_day: 20 },
    { tools: ['WhatsApp Business'] },
  ),
  t('s4a4', 4, 'Garantir 1 reserva confirmado por vaga', ['daniel'], { kind: 'daily', start_day: 20 }),
  t('s4a5', 4, 'Acompanhar presencialmente o início do turno nas 5 primeiras vagas', ['diego'], {
    kind: 'daily',
    start_day: 21,
    end_day: 30,
  }),
  t(
    's4a6',
    4,
    'Pagar o freelancer e registrar avaliação em até 24 horas do turno',
    ['daniel'],
    { kind: 'daily', start_day: 20 },
    { tools: ['Aplicativo Freela'] },
  ),
  t('s4a7', 4, 'Ligar para o dono no dia seguinte de cada turno', ['daniel'], {
    kind: 'weekday',
    start_day: 20,
  }),
  t(
    's4a8',
    4,
    'Fechar a conta dos 20 turnos e lançar os números',
    ['daniel'],
    { kind: 'once', day: 35 },
    {
      expects_result: true,
      expected: 'Turnos concluídos, faltas, tempo médio de preenchimento e nota média',
    },
  ),

  // ── Etapa 5 — Provas sociais
  t(
    's5a1',
    5,
    'Escolher os 5 donos (com 3 ou mais contratações) e os 5 freelancers',
    ['daniel'],
    { kind: 'once', day: 36 },
    { tools: ['CRM'] },
  ),
  t('s5a2', 5, 'Pedir a autorização de imagem por escrito', ['daniel'], { kind: 'once', day: 37 }),
  t('s5a3', 5, 'Gravar os 5 vídeos de donos, no salão da casa', ['daniel'], {
    kind: 'daily',
    start_day: 38,
    end_day: 45,
  }),
  t('s5a4', 5, 'Gravar os 5 vídeos de freelancers', ['daniel'], {
    kind: 'daily',
    start_day: 38,
    end_day: 45,
  }),
  t('s5a5', 5, 'Escrever os 3 casos das casas grandes', ['diego'], { kind: 'once', day: 46 }),
  t('s5a6', 5, 'Editar, legendar e aplicar a marca nos 10 vídeos', ['mkt'], { kind: 'once', day: 48 }),
  t(
    's5a7',
    5,
    'Publicar no perfil e montar a pasta da praça com tudo',
    ['mkt'],
    { kind: 'once', day: 49 },
    { tools: ['Instagram'] },
  ),
  t(
    's5a8',
    5,
    'Distribuir o link da pasta para o time usar na prospecção',
    ['daniel'],
    { kind: 'once', day: 49 },
    { tools: ['WhatsApp Business'] },
  ),

  // ── Etapa 6 — Trazer os 10 de volta (portão)
  t(
    's6a1',
    6,
    'Programar no CRM a régua de dias 1, 7, 20 e 30 de cada cliente',
    ['daniel'],
    { kind: 'once', day: 30 },
    { tools: ['CRM'] },
  ),
  t(
    's6a2',
    6,
    'Mandar no dia 7 a mensagem oferecendo a próxima vaga',
    ['daniel'],
    { kind: 'weekday', start_day: 30 },
    {
      tools: ['WhatsApp Business'],
      msg: 'Oi, {nome}! Faz uma semana do primeiro turno com a Freela. Quer já deixar a próxima vaga marcada para esta semana? Consigo garantir o mesmo freelancer.',
    },
  ),
  t('s6a3', 6, 'Ligar no dia 20 em quem não abriu a segunda vaga', ['daniel'], {
    kind: 'weekday',
    start_day: 30,
  }),
  t('s6a4', 6, 'Ligar pessoalmente nas casas grandes que não voltaram', ['diego'], { kind: 'once', day: 52 }),
  t(
    's6a5',
    6,
    'Classificar o motivo de cada não-recontratação no CRM',
    ['daniel'],
    { kind: 'once', day: 56 },
    { tools: ['CRM'] },
  ),
  t('s6a6', 6, 'Escrever o plano de destrave de cada cliente parado', ['daniel'], { kind: 'once', day: 58 }),
  t(
    's6a7',
    6,
    'Fechar a conta dos 30 dias e apresentar o número na matinal',
    ['daniel'],
    { kind: 'once', day: 60 },
    { expects_result: true, expected: 'Quantos dos 10 clientes abriram a segunda vaga' },
  ),
  t('s6a8', 6, 'Conferir o portão e decidir se avança ou refaz a etapa 4', ['diego'], {
    kind: 'once',
    day: 60,
  }),

  // ── Etapa 7 — Vender para a lista inteira
  t(
    's7a1',
    7,
    'Dividir as 200 casas em lotes diários de 15 a 20 no CRM',
    ['daniel'],
    { kind: 'once', day: 61 },
    { tools: ['CRM'] },
  ),
  t(
    's7a2',
    7,
    'Toque 1 — mandar a mensagem com o vídeo do dono da região',
    ['daniel'],
    { kind: 'weekday', start_day: 61 },
    { tools: ['WhatsApp Business'] },
  ),
  t('s7a3', 7, 'Toque 2 — ligar 2 dias depois da mensagem', ['daniel'], { kind: 'weekday', start_day: 61 }),
  t('s7a4', 7, 'Toque 3 — visitar as casas grandes e alvos que responderam', ['diego'], {
    kind: 'weekly',
    weekday: 2,
    start_day: 61,
  }),
  t(
    's7a5',
    7,
    'Montar a fila de reaquecimento de quem não respondeu',
    ['daniel'],
    { kind: 'once', day: 84 },
    { tools: ['CRM'] },
  ),
  t(
    's7a6',
    7,
    'Fechar a conta da etapa e lançar os números',
    ['daniel'],
    { kind: 'once', day: 85 },
    { expects_result: true, expected: 'Lista tocada, clientes novos cadastrados e com vaga rodada' },
  ),

  // ── Etapa 8 — Aumentar a base de freelancer
  t(
    's8a1',
    8,
    'Entrar nos grupos de emprego e de freela da cidade',
    ['daniel'],
    { kind: 'once', day: 62 },
    { tools: ['WhatsApp Business'] },
  ),
  t('s8a2', 8, 'Criar a peça padrão de vaga para publicar nos grupos', ['mkt'], { kind: 'once', day: 63 }),
  t(
    's8a3',
    8,
    'Publicar as vagas do dia nos grupos e no canal da praça',
    ['daniel'],
    { kind: 'daily', start_day: 63 },
    { tools: ['WhatsApp Business'] },
  ),
  t(
    's8a4',
    8,
    'Publicar um recado útil por semana no canal da praça',
    ['mkt'],
    { kind: 'weekly', weekday: 3, start_day: 63 },
    { tools: ['WhatsApp Business'] },
  ),
  t(
    's8a5',
    8,
    'Listar e contatar as escolas de gastronomia e cursos de garçom',
    ['daniel'],
    { kind: 'once', day: 70 },
    { tools: ['Google Maps'] },
  ),
  t('s8a6', 8, 'Fechar 1 parceria de escola com apresentação para a turma', ['diego'], {
    kind: 'once',
    day: 84,
  }),
  t(
    's8a7',
    8,
    'Criar o grupo dos verificados e dar prioridade de vaga a eles',
    ['daniel'],
    { kind: 'once', day: 66 },
    { tools: ['WhatsApp Business'] },
  ),
  t('s8a8', 8, 'Atualizar a folha de confirmados por função', ['daniel'], {
    kind: 'weekly',
    weekday: 1,
    start_day: 62,
  }),

  // ── Etapa 9 — Programa de indicação
  t('s9a1', 9, 'Definir o valor do bônus e as regras do programa', ['diego'], { kind: 'once', day: 66 }),
  t('s9a2', 9, 'Escrever as regras em uma página, em linguagem simples', ['daniel'], {
    kind: 'once',
    day: 68,
  }),
  t(
    's9a3',
    9,
    'Pedir ao desenvolvedor a regra dentro do aplicativo (bônus só após turno concluído)',
    ['diego'],
    { kind: 'once', day: 70 },
    {
      tools: ['Aplicativo Freela'],
      attention: 'Bônus só é pago depois do turno concluído — nunca no cadastro.',
    },
  ),
  t('s9a4', 9, 'Criar a peça de divulgação do programa', ['mkt'], { kind: 'once', day: 72 }),
  t(
    's9a5',
    9,
    'Anunciar no grupo dos verificados e no canal da praça',
    ['daniel'],
    { kind: 'once', day: 74 },
    { tools: ['WhatsApp Business'] },
  ),
  t('s9a6', 9, 'Oferecer o programa ao cliente na ligação de retorno', ['daniel'], {
    kind: 'weekday',
    start_day: 74,
  }),
  t(
    's9a7',
    9,
    'Publicar o ranking do mês no grupo',
    ['daniel'],
    { kind: 'monthly', month_day: 1, start_day: 74 },
    { tools: ['WhatsApp Business'] },
  ),

  // ── Etapa 10 — Tráfego (portão)
  t('s10a1', 10, 'Colocar no ar a página da cidade no Google', ['mkt'], { kind: 'once', day: 76 }),
  t('s10a2', 10, 'Preencher o perfil da praça no Google Meu Negócio', ['mkt'], { kind: 'once', day: 77 }),
  t('s10a3', 10, 'Confirmar com o Daniel que o preenchimento está abaixo de 4 horas hoje', ['mkt'], {
    kind: 'once',
    day: 78,
  }),
  t(
    's10a4',
    10,
    'Montar a campanha de cliente, recortada pela área da praça',
    ['mkt'],
    { kind: 'once', day: 80 },
    { tools: ['Meta Ads'] },
  ),
  t(
    's10a5',
    10,
    'Montar a campanha de freelancer, separada da de cliente',
    ['mkt'],
    { kind: 'once', day: 80 },
    {
      tools: ['Meta Ads'],
      attention: 'Campanha de freelancer nunca junto com a de cliente: público e verba separados.',
    },
  ),
  t('s10a6', 10, 'Aprovar a verba do mês', ['diego'], { kind: 'once', day: 81 }),
  t(
    's10a7',
    10,
    'Medir todo dia o custo por cliente novo e o tempo de preenchimento',
    ['mkt'],
    { kind: 'weekday', start_day: 81 },
    { tools: ['Meta Ads'] },
  ),
  t('s10a8', 10, 'Levar os números ao Rito de Mídia e decidir a verba do fim de semana', ['diego'], {
    kind: 'weekly',
    weekday: 4,
    start_day: 81,
  }),

  // ── Etapa 11 — Praça rodando
  t(
    's11a1',
    11,
    'Fechar a folha da praça com os três números',
    ['daniel'],
    { kind: 'once', day: 96 },
    { expects_result: true, expected: 'Clientes ativos, recontratação em 30 dias e tempo de preenchimento' },
  ),
  t('s11a2', 11, 'Nomear o responsável da praça', ['diego'], { kind: 'once', day: 97 }),
  t('s11a3', 11, 'Escrever o que mudou no roteiro nesta cidade', ['diego'], { kind: 'once', day: 97 }),
  t('s11a4', 11, 'Rito de Fase — decidir abrir a próxima praça ou segurar, e registrar em ata', ['diego'], {
    kind: 'once',
    day: 98,
  }),

  // ── Ações fixas (fora das etapas)
  t('f1', 0, 'Reunião matinal com os 3 números do dia (10h)', ['diego', 'daniel'], {
    kind: 'weekday',
    start_day: 0,
  }),
  t(
    'f2',
    0,
    'Tratar todas as vagas abertas do dia antes de qualquer lead novo',
    ['daniel'],
    { kind: 'weekday', start_day: 0 },
    { attention: 'Vaga aberta sempre vem antes de lead novo.' },
  ),
  t(
    'f3',
    0,
    'Deixar o CRM em dia e reportar as contratações no grupo (fim do dia)',
    ['daniel'],
    { kind: 'weekday', start_day: 0 },
    { tools: ['CRM'] },
  ),
  t(
    'f4',
    0,
    'Responder as mensagens das redes sociais',
    ['mkt'],
    { kind: 'weekday', start_day: 0 },
    { tools: ['Instagram'] },
  ),
  t('f5', 0, 'Alinhamento semanal da praça', ['diego', 'daniel'], {
    kind: 'weekly',
    weekday: 1,
    start_day: 0,
  }),
  t('f6', 0, 'Rito de Mídia — decidir a verba do fim de semana (15 min)', ['diego', 'mkt'], {
    kind: 'weekly',
    weekday: 4,
    start_day: 0,
  }),
  t('f7', 0, 'Fechamento da semana com os números', ['diego', 'daniel'], {
    kind: 'weekly',
    weekday: 5,
    start_day: 0,
  }),
];

export async function seedTemplateActions(prisma: PrismaClient) {
  for (const [sort, a] of TEMPLATE_ACTIONS.entries()) {
    // `SEED_USER_IDS` vem de `../seed` (import circular, resolvido só aqui
    // dentro, em tempo de chamada — nunca no topo do módulo).
    const owners = a.owners.map((o) => SEED_USER_IDS[o]);
    await prisma.template_actions.upsert({
      where: { key: a.key },
      update: {},
      create: {
        key: a.key,
        step: a.step,
        title: a.title,
        owners,
        ...recToRow(a.rec),
        tools: a.tools ?? [],
        how_to: a.how_to ?? [],
        expected: a.expected ?? null,
        msg: a.msg ?? null,
        attention: a.attention ?? null,
        expects_result: a.expects_result ?? false,
        sort,
      },
    });
  }
  console.log(`✔ Roteiro-modelo: ${TEMPLATE_ACTIONS.length} ações-modelo`);
}
