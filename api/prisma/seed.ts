/**
 * Seed das contas (pessoas) do PRAÇA.
 *
 * `seedUsers()` cria — idempotente por e-mail — as três contas fixas do time:
 * Diego (CEO, admin), Rebeca (comercial/CS) e o contato de Marketing externo
 * (agência). IDs fixos (`SEED_USER_IDS`) para as próximas tarefas referenciarem
 * donos (ex.: `owner_id` de leads/actions) sem precisar reconsultar o banco.
 *
 * `main()` chama `seedUsers`, depois o roteiro-modelo (`seedTemplateActions`)
 * e a praça de demonstração (`seedPraca`, que instancia o roteiro como ações)
 * e o funil de leads dessa praça (`seedLeads`) — sempre nesta ordem, porque
 * cada uma depende da anterior. Por último, os modelos de mensagem e a linha
 * de configurações de envio (`seedMsgTemplates`/`seedAppSettings`), que não
 * dependem de nada acima, e as cadências-modelo (`seedCadences`), que dependem
 * dos modelos de mensagem (os nós apontam para `SEED_TEMPLATE_IDS`). Por fim
 * a mídia da praça (`seedMidia`: provas, campanhas, criativos e tráfego), que
 * depende da praça existir.
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { seedCadences } from './seed-data/cadences';
import { seedLeads } from './seed-data/leads';
import { seedMidia } from './seed-data/midia';
import { seedAppSettings, seedMsgTemplates } from './seed-data/msg-templates';
import { seedPraca } from './seed-data/praca';
import { seedTemplateActions } from './seed-data/template-actions';

/**
 * Senha das contas em desenvolvimento. Em `NODE_ENV=production` ela **não** é
 * usada: o seed exige `SEED_ADMIN_PASSWORD` e cria só o admin.
 *
 * O formulário público precisa estar na internet (é embutido em anúncio e
 * landing), então a API inteira fica exposta — `POST /v1/auth/login` incluído.
 * `prisma migrate deploy && npm run seed` num servidor de verdade não pode
 * deixar `diego@praca.local` / `praca123` admin e ativo.
 */
const SENHA_DEMO = 'praca123';

/** Senha mínima do admin em produção — a mesma do `SetPasswordDto`. */
const MIN_SENHA = 8;

export const SEED_USER_IDS = {
  diego: '00000000-0000-4000-8000-000000000001',
  rebeca: '00000000-0000-4000-8000-000000000002',
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
    id: SEED_USER_IDS.rebeca,
    email: 'rebeca@praca.local',
    name: 'Rebeca',
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

type SeedUser = (typeof SEED_USERS)[number];

/**
 * Senha e contas a criar, conforme o ambiente.
 *
 * - produção: `SEED_ADMIN_PASSWORD` obrigatória (mínimo 8) e **só o admin** —
 *   as duas contas de demonstração (Rebeca e Mkt externo) ficam de fora;
 * - resto: as três contas com a senha de demonstração.
 */
function planoDoSeed(): { senha: string; users: readonly SeedUser[] } {
  if (process.env.NODE_ENV !== 'production') return { senha: SENHA_DEMO, users: SEED_USERS };
  const senha = (process.env.SEED_ADMIN_PASSWORD ?? '').trim();
  if (senha.length < MIN_SENHA) {
    throw new Error(
      `NODE_ENV=production: defina SEED_ADMIN_PASSWORD (mínimo ${MIN_SENHA} caracteres) antes de rodar o seed. ` +
        'Em produção o seed cria só a conta admin — sem ela, a API subiria com a senha de demonstração pública.',
    );
  }
  return { senha, users: SEED_USERS.filter((u) => u.is_admin) };
}

export async function seedUsers(prisma: PrismaClient) {
  const { senha, users } = planoDoSeed();
  for (const u of users) {
    // `update: {}` — só cria na ausência; rodar de novo não sobrescreve o que
    // já foi editado pelo time (nome, cor, role_label) depois do primeiro boot.
    await prisma.users.upsert({
      where: { email: u.email },
      update: {},
      create: {
        id: u.id,
        email: u.email,
        password_hash: await bcrypt.hash(senha, 10),
        name: u.name,
        role_label: u.role_label,
        color: u.color,
        is_admin: u.is_admin,
        sort: u.sort,
      },
    });
  }
  const comoFoi = senha === SENHA_DEMO ? `senha ${SENHA_DEMO}` : 'senha de SEED_ADMIN_PASSWORD';
  console.log(`✔ Pessoas: ${users.map((u) => u.email).join(', ')} (${comoFoi})`);
}

async function main() {
  const prisma = new PrismaClient();
  try {
    await seedUsers(prisma);
    await seedTemplateActions(prisma);
    await seedPraca(prisma);
    await seedLeads(prisma);
    await seedMsgTemplates(prisma);
    await seedAppSettings(prisma);
    await seedCadences(prisma);
    await seedMidia(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
