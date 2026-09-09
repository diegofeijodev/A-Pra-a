/**
 * Seed das contas (pessoas) do PRAÇA.
 *
 * `seedUsers()` cria — idempotente por e-mail — as três contas fixas do time:
 * Diego (CEO, admin), Daniel (comercial/CS) e o contato de Marketing externo
 * (agência). IDs fixos (`SEED_USER_IDS`) para as próximas tarefas referenciarem
 * donos (ex.: `owner_id` de leads/actions) sem precisar reconsultar o banco.
 *
 * `main()` chama `seedUsers` e, nas próximas tarefas do plano, as demais
 * seeds — sempre nesta ordem.
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const SENHA_DEMO = 'praca123';

export const SEED_USER_IDS = {
  diego: '00000000-0000-4000-8000-000000000001',
  daniel: '00000000-0000-4000-8000-000000000002',
  mkt: '00000000-0000-4000-8000-000000000003',
} as const;

const SEED_USERS = [
  {
    id: SEED_USER_IDS.diego,
    email: 'diego@praca.local',
    name: 'Diego',
    role_label: 'CEO — visitas às casas grandes, decisões, aprovação de verba',
    color: '#ECA826',
    is_admin: true,
    sort: 0,
  },
  {
    id: SEED_USER_IDS.daniel,
    email: 'daniel@praca.local',
    name: 'Daniel',
    role_label: 'Comercial e Sucesso do Cliente — prospecção, operação das vagas, retenção',
    color: '#2E6F7E',
    is_admin: false,
    sort: 1,
  },
  {
    id: SEED_USER_IDS.mkt,
    email: 'mkt@praca.local',
    name: 'Mkt externo',
    role_label: 'Agência — disparos, edição de vídeo, peças e tráfego pago',
    color: '#6B5B8A',
    is_admin: false,
    sort: 2,
  },
] as const;

export async function seedUsers(prisma: PrismaClient) {
  for (const u of SEED_USERS) {
    // `update: {}` — só cria na ausência; rodar de novo não sobrescreve o que
    // já foi editado pelo time (nome, cor, role_label) depois do primeiro boot.
    await prisma.users.upsert({
      where: { email: u.email },
      update: {},
      create: {
        id: u.id,
        email: u.email,
        password_hash: await bcrypt.hash(SENHA_DEMO, 10),
        name: u.name,
        role_label: u.role_label,
        color: u.color,
        is_admin: u.is_admin,
        sort: u.sort,
      },
    });
  }
  console.log(`✔ Pessoas: ${SEED_USERS.map((u) => u.email).join(', ')} (senha ${SENHA_DEMO})`);
}

async function main() {
  const prisma = new PrismaClient();
  try {
    await seedUsers(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
