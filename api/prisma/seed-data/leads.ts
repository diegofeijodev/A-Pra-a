/**
 * Funil de demonstração — os 25 leads do protótipo
 * (`.prototype/src/lib/praca/funil.ts:107-187`, `ROWS` + `seedLeads`), com as
 * mesmas casas, donos, telefones e textos de evento.
 *
 * Tudo é relativo a HOJE (Brasília), como no protótipo: um lead com `gap: 9`
 * nasce com 9 dias sem contato em qualquer dia que o seed rodar — é o que faz
 * a tela do funil já abrir com parados, críticos e fila do dia de verdade.
 *
 * Idempotente por (praça, nome): rodar de novo não duplica nem sobrescreve o
 * que o time já mexeu. Para "renovar" as datas, apague os leads da praça seed
 * e rode outra vez.
 */
import { PrismaClient } from '@prisma/client';
import { phoneKey } from '../../src/common/phone/phone';
import { addDays, todaySp } from '../../src/common/time/dates';
import { SEED_USER_IDS } from '../seed-plan';
import { SEED_PRACA_ID } from './praca';

type Owner = 'diego' | 'rebeca' | 'mkt';

interface LeadSeedRow {
  n: string;
  city: 'Belo Horizonte' | 'Contagem';
  stage: number;
  classe: 'grande' | 'alvo' | 'depois';
  origem: string;
  owner: Owner;
  /** Dias sem contato. */
  gap: number;
  decisor: string;
  cargo: string;
}

export const LEAD_ROWS: LeadSeedRow[] = [
  { n: 'Bar do Mercado', city: 'Belo Horizonte', stage: 1, classe: 'alvo', origem: 'importação', owner: 'rebeca', gap: 2, decisor: 'Marcos Vieira', cargo: 'Proprietário' },
  { n: 'Restaurante Sabor Mineiro', city: 'Contagem', stage: 1, classe: 'depois', origem: 'tráfego', owner: 'rebeca', gap: 1, decisor: 'Cleide Ramos', cargo: 'Gerente' },
  { n: 'Buffet Encanto', city: 'Belo Horizonte', stage: 1, classe: 'grande', origem: 'indicação', owner: 'diego', gap: 9, decisor: 'Rita Andrade', cargo: 'Sócia' },
  { n: 'Bar Esquina 47', city: 'Belo Horizonte', stage: 1, classe: 'depois', origem: 'prospecção', owner: 'rebeca', gap: 3, decisor: 'Ivo Prado', cargo: 'Proprietário' },
  { n: 'Hotel Serra Azul', city: 'Contagem', stage: 2, classe: 'grande', origem: 'importação', owner: 'diego', gap: 4, decisor: 'Paulo Nunes', cargo: 'Gerente geral' },
  { n: 'Cantina da Vila', city: 'Belo Horizonte', stage: 2, classe: 'alvo', origem: 'prospecção', owner: 'rebeca', gap: 6, decisor: 'Sandra Lopes', cargo: 'Proprietária' },
  { n: 'Casa de Eventos Aurora', city: 'Contagem', stage: 2, classe: 'grande', origem: 'tráfego', owner: 'diego', gap: 17, decisor: 'Fábio Teles', cargo: 'Diretor' },
  { n: 'Padaria & Bistrô Central', city: 'Belo Horizonte', stage: 2, classe: 'depois', origem: 'importação', owner: 'rebeca', gap: 2, decisor: 'Elias Souza', cargo: 'Sócio' },
  { n: 'Churrascaria Boi Dourado', city: 'Contagem', stage: 3, classe: 'grande', origem: 'indicação', owner: 'diego', gap: 3, decisor: 'Wagner Melo', cargo: 'Proprietário' },
  { n: 'Bar Rooftop 12', city: 'Belo Horizonte', stage: 3, classe: 'alvo', origem: 'tráfego', owner: 'rebeca', gap: 1, decisor: 'Tatiana Reis', cargo: 'Gerente' },
  { n: 'Restaurante Pátio Sul', city: 'Belo Horizonte', stage: 3, classe: 'alvo', origem: 'prospecção', owner: 'rebeca', gap: 11, decisor: 'Hélio Braga', cargo: 'Proprietário' },
  { n: 'Buffet Primavera', city: 'Contagem', stage: 4, classe: 'grande', origem: 'indicação', owner: 'diego', gap: 2, decisor: 'Célia Martins', cargo: 'Sócia' },
  { n: 'Hotel Portal Mineiro', city: 'Belo Horizonte', stage: 4, classe: 'grande', origem: 'importação', owner: 'diego', gap: 5, decisor: 'Renato Dias', cargo: 'Gerente de A&B' },
  { n: 'Bar Quintal do Lago', city: 'Contagem', stage: 4, classe: 'alvo', origem: 'tráfego', owner: 'rebeca', gap: 1, decisor: 'Juliana Paiva', cargo: 'Proprietária' },
  { n: 'Espaço Bela Vista', city: 'Belo Horizonte', stage: 5, classe: 'alvo', origem: 'prospecção', owner: 'rebeca', gap: 3, decisor: 'Otávio Lima', cargo: 'Coordenador' },
  { n: 'Restaurante Forno & Brasa', city: 'Contagem', stage: 5, classe: 'depois', origem: 'importação', owner: 'rebeca', gap: 4, decisor: 'Márcia Coelho', cargo: 'Gerente' },
  { n: 'Casa de Show Beira Trilho', city: 'Belo Horizonte', stage: 5, classe: 'grande', origem: 'indicação', owner: 'diego', gap: 8, decisor: 'Bruno Vasques', cargo: 'Sócio' },
  { n: 'Buffet Jardim das Flores', city: 'Contagem', stage: 6, classe: 'alvo', origem: 'tráfego', owner: 'rebeca', gap: 2, decisor: 'Leandro Pires', cargo: 'Proprietário' },
  { n: 'Bar Mangueira', city: 'Belo Horizonte', stage: 6, classe: 'depois', origem: 'prospecção', owner: 'rebeca', gap: 6, decisor: 'Ana Clara Freitas', cargo: 'Gerente' },
  { n: 'Hotel Mirante Norte', city: 'Belo Horizonte', stage: 6, classe: 'grande', origem: 'importação', owner: 'diego', gap: 3, decisor: 'Silvio Rocha', cargo: 'Gerente geral' },
  { n: 'Restaurante Casa Cheia', city: 'Contagem', stage: 7, classe: 'grande', origem: 'indicação', owner: 'diego', gap: 2, decisor: 'Nadia Campos', cargo: 'Proprietária' },
  { n: 'Buffet Villa Real', city: 'Belo Horizonte', stage: 7, classe: 'alvo', origem: 'tráfego', owner: 'rebeca', gap: 1, decisor: 'Gustavo Amaral', cargo: 'Sócio' },
  { n: 'Bar Trilho Velho', city: 'Belo Horizonte', stage: 7, classe: 'alvo', origem: 'prospecção', owner: 'rebeca', gap: 4, decisor: 'Priscila Nogueira', cargo: 'Gerente' },
  { n: 'Pizzaria Fornalha', city: 'Contagem', stage: 8, classe: 'depois', origem: 'importação', owner: 'rebeca', gap: 22, decisor: 'Roberto Kina', cargo: 'Proprietário' },
  { n: 'Espaço Céu Aberto', city: 'Belo Horizonte', stage: 8, classe: 'alvo', origem: 'tráfego', owner: 'diego', gap: 30, decisor: 'Dora Menezes', cargo: 'Sócia' },
];

export async function seedLeads(prisma: PrismaClient) {
  const today = todaySp();
  let criados = 0;

  for (const [i, r] of LEAD_ROWS.entries()) {
    const jaTem = await prisma.leads.findFirst({
      where: { praca_id: SEED_PRACA_ID, name: r.n },
      select: { id: true },
    });
    if (jaTem) continue;

    const owner = SEED_USER_IDS[r.owner];
    const contact = addDays(today, -r.gap);
    const phone = `(31) 9${String(8000 + i * 37).slice(0, 4)}-${String(1000 + i * 91).slice(0, 4)}`;
    const perdido = r.stage === 8;
    const lostReason = perdido ? (i % 2 === 0 ? 'não respondeu' : 'preço') : null;
    // Próximo passo só em lead vivo que teve toque recente (gap <= 7).
    const temProximo = !perdido && r.gap <= 7;

    const eventos = [
      {
        at: new Date(`${addDays(today, -(r.gap + 6 + (i % 5)))}T09:12:00.000Z`),
        author_id: owner,
        kind: 'note',
        text: `Lead entrou por ${r.origem}.`,
      },
    ];
    if (r.stage > 1) {
      eventos.push({
        at: new Date(`${contact}T14:30:00.000Z`),
        author_id: owner,
        kind: r.stage >= 4 ? 'visit' : r.stage === 3 ? 'msg_in' : 'msg_out',
        text:
          r.stage >= 4
            ? `Visita na casa, conversa com ${r.decisor}.`
            : r.stage === 3
              ? 'Respondeu no WhatsApp, quer entender preço.'
              : 'Primeira mensagem enviada no WhatsApp.',
      });
    }

    const vagas =
      r.stage >= 6
        ? [
            { date: addDays(today, -(20 + i)), funcao: 'Garçom', filled: true, hours: 3 },
            {
              date: addDays(today, -(6 + (i % 4))),
              funcao: 'Cozinheiro',
              filled: r.stage === 7,
              hours: r.stage === 7 ? 2 : null,
            },
          ]
        : [];

    await prisma.leads.create({
      data: {
        praca_id: SEED_PRACA_ID,
        name: r.n,
        city: r.city,
        address: `Rua ${100 + i * 7}, ${r.city}`,
        phone,
        phone_key: phoneKey(phone),
        instagram: `@${r.n.toLowerCase().replace(/[^a-z0-9]+/g, '')}`,
        site: '',
        decisor: r.decisor,
        decisor_role: r.cargo,
        classe: r.classe,
        origem: r.origem,
        owner_id: owner,
        stage: r.stage,
        entered_at: addDays(today, -(r.gap + 10 + (i % 12))),
        stage_since: addDays(today, -(r.gap + 1)),
        last_contact_at: r.stage > 1 ? new Date(`${contact}T14:30:00.000Z`) : null,
        next_step_what: temProximo
          ? r.stage >= 6
            ? 'Confirmar próxima vaga'
            : r.stage >= 4
              ? 'Fechar cadastro na plataforma'
              : 'Novo toque no WhatsApp'
          : null,
        next_step_date: temProximo ? addDays(today, (i % 5) + 1) : null,
        lost_reason: lostReason,
        reheat_at: lostReason === 'não respondeu' ? addDays(today, 30) : null,
        is_test: false,
        // Autor é o dono do lead; `author_label` só existe para evento que veio
        // de fora (importação, robô) — aqui é sempre gente do time.
        events: { create: eventos },
        ...(vagas.length ? { vagas: { create: vagas } } : {}),
      },
    });
    criados++;
  }

  console.log(`✔ Funil: ${LEAD_ROWS.length} leads na praça seed (${criados} criados agora)`);
}
