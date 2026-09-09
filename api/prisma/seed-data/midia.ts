/**
 * Mídia da praça de demonstração — porta literal de `seedProofs`/`seedCampanhas`
 * do protótipo (`.prototype/src/lib/praca/campanhas.ts:196-296`): 13 provas,
 * 2 campanhas (contratante e freelancer), 5 criativos tirados dos roteiros-
 * -modelo, 1 entrada de tráfego no Meta e os 6 últimos dias lançados.
 *
 * Idempotente pela existência de campanha na praça seed: rodar de novo não
 * duplica prova nem ressuscita campanha que o time apagou de propósito.
 *
 * Precisa rodar DEPOIS de `seedPraca` (as provas e as campanhas são da praça) e
 * de `seedLeads` só por ordem de leitura — os leads do funil já carregam
 * `campanha_id` nulo, quem amarra lead a campanha é a tela.
 */
import { PrismaClient } from '@prisma/client';
import { addDays, todaySp } from '../../src/common/time/dates';
import { SCRIPT_MODELS } from '../../src/domain/catalog/midia';
import { campanhaName } from '../../src/domain/midia-rules';
import { SEED_PRACA_ID } from './praca';

const PROVAS_DONO = [
  'Bar do Mercado — sábado sem falta',
  'Restaurante Sabor Mineiro — 2 vagas em 3h',
  'Buffet Encanto — evento de 300 pessoas',
  'Boteco da Praça — dono falando do preço',
  'Hotel Serra Azul — café da manhã salvo',
];

const PROVAS_FREELA = [
  'Garçom Rafael — primeiro turno',
  'Cozinheira Lúcia — 12 turnos',
  'Churrasqueiro Ivo — nota 4,9',
  'Motoboy Wesley — evento',
  'Garçonete Bruna — pagamento no prazo',
];

const PROVAS_CASO = [
  'Caso escrito: 10 PDVs em 21 dias',
  'Caso escrito: preenchimento médio de 3h20',
  'Caso escrito: 6 de 10 recontrataram em 30 dias',
];

/** Criativo do seed: qual roteiro-modelo, em que status e para que dia. */
const CRIATIVOS: { campanha: 1 | 2; model: number; status: string; day: number }[] = [
  { campanha: 1, model: 0, status: 'aprovado', day: 2 },
  { campanha: 1, model: 1, status: 'producao', day: 5 },
  { campanha: 1, model: 3, status: 'a_fazer', day: 8 },
  { campanha: 2, model: 2, status: 'aprovacao', day: 3 },
  { campanha: 2, model: 4, status: 'a_fazer', day: 6 },
];

export async function seedMidia(prisma: PrismaClient) {
  const ja = await prisma.campanhas.count({ where: { praca_id: SEED_PRACA_ID } });
  if (ja) {
    console.log(`✔ Mídia: ${ja} campanha(s) já na praça seed — nada a fazer`);
    return;
  }

  const praca = await prisma.pracas.findUnique({
    where: { id: SEED_PRACA_ID },
    select: { name: true, city: true },
  });
  if (!praca) {
    console.log('✔ Mídia: praça seed ausente — rode seedPraca antes');
    return;
  }

  const provas = [
    ...PROVAS_DONO.map((title) => ({ praca_id: SEED_PRACA_ID, kind: 'video_dono', title })),
    ...PROVAS_FREELA.map((title) => ({ praca_id: SEED_PRACA_ID, kind: 'video_freela', title })),
    ...PROVAS_CASO.map((title) => ({ praca_id: SEED_PRACA_ID, kind: 'caso', title })),
  ];
  const criadas = await prisma.proofs.createManyAndReturn({ data: provas, select: { id: true, kind: true } });
  const idsPorTipo = (kind: string) => criadas.filter((p) => p.kind === kind).map((p) => p.id);
  // c1 usa prova de dono e caso escrito (as 3 primeiras que não são de freela);
  // c2, as 2 primeiras de freelancer — mesmo corte do protótipo.
  const provasC1 = [...idsPorTipo('video_dono'), ...idsPorTipo('caso')].slice(0, 3);
  const provasC2 = idsPorTipo('video_freela').slice(0, 2);

  const start = todaySp();
  const end = addDays(start, 30);

  const c1 = await prisma.campanhas.create({
    data: {
      name: campanhaName(praca, 'contratante', 'cadastro_contratante', start),
      praca_id: SEED_PRACA_ID,
      publico: 'contratante',
      objetivo: 'cadastro_contratante',
      start,
      end,
      verba: 6000,
      gasto: 0,
      dor: 'Dono de bar perde o sábado quando falta gente no turno.',
      oferta: 'Primeira contratação sem taxa.',
      mensagem_chave: 'Faltou gente? A vaga é preenchida no mesmo dia, com freela avaliado da sua região.',
      destino: 'formulario',
      kpi_name: 'Cadastros de contratante',
      kpi_meta: 30,
      kpi_custo: 130,
      cac_teto: 130,
      status: 'ativa',
      provas: { create: provasC1.map((proof_id) => ({ proof_id })) },
    },
  });

  const c2 = await prisma.campanhas.create({
    data: {
      name: campanhaName(praca, 'freelancer', 'cadastro_freelancer', start),
      praca_id: SEED_PRACA_ID,
      publico: 'freelancer',
      objetivo: 'cadastro_freelancer',
      start,
      end,
      verba: 2500,
      gasto: 0,
      dor: 'Vaga aberta sem freela disponível para o turno.',
      oferta: 'Vagas da semana com pagamento garantido do turno.',
      mensagem_chave: 'Vagas abertas na sua cidade, com valor do turno combinado antes.',
      destino: 'loja',
      kpi_name: 'Freelancers confirmados',
      kpi_meta: 60,
      kpi_custo: 25,
      cac_teto: 130,
      status: 'ativa',
      provas: { create: provasC2.map((proof_id) => ({ proof_id })) },
    },
  });

  const criativos = await prisma.creatives.createManyAndReturn({
    data: CRIATIVOS.map((c) => {
      const m = SCRIPT_MODELS[c.model]!;
      return {
        campanha_id: c.campanha === 1 ? c1.id : c2.id,
        formato: m.formato,
        titulo: m.titulo,
        gancho: m.gancho,
        roteiro_gancho: m.roteiro.gancho,
        roteiro_desenvolvimento: m.roteiro.desenvolvimento,
        roteiro_prova: m.roteiro.prova,
        roteiro_cta: m.roteiro.cta,
        legenda: m.legenda,
        cta_botao: m.cta_botao,
        due: addDays(start, c.day),
        publish_at: addDays(start, c.day + 2),
        status: c.status,
        file_url: '',
      };
    }),
    select: { id: true, campanha_id: true },
  });

  // Uma entrada de tráfego, no Meta, com os criativos da campanha de contratante
  // e os 6 últimos dias já lançados na mão (6 × 120 = 720 investidos).
  await prisma.traffic_entries.create({
    data: {
      campanha_id: c1.id,
      plataforma: 'meta',
      nome_la: c1.name,
      publico: 'Donos de bar e restaurante, 25–55, interesse em gestão de bares',
      geo: `${praca.city} + cidades num raio de 50 km`,
      verba_diaria: 120,
      criativos: criativos.filter((c) => c.campanha_id === c1.id).map((c) => c.id),
      manager_url: '',
      api_connected: false,
      days: {
        create: [6, 5, 4, 3, 2, 1].map((back, i) => ({
          date: addDays(start, -back),
          investido: 120,
          alcance: 9200 + i * 640,
          cliques: 168 + i * 12,
          conversoes: i === 0 ? 0 : 1,
        })),
      },
    },
  });

  console.log(
    `✔ Mídia: ${provas.length} provas, 2 campanhas (${c1.name}, ${c2.name}), ${criativos.length} criativos, 1 entrada Meta com 6 dias`,
  );
}
