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
import { planoDoSeed, type PlanoDoSeed } from './seed-plan';

export { SEED_USER_IDS } from './seed-plan';

/**
 * Cria as pessoas do plano (`planoDoSeed`, em `seed-plan.ts`). Em produção a API
 * inteira fica na internet (o formulário público é embutido em anúncio e
 * landing), então `prisma migrate deploy && npm run seed` num servidor de verdade
 * nunca deixa conta com a senha de demonstração: o admin usa
 * `SEED_ADMIN_PASSWORD` e as demais nascem com senha aleatória.
 */
export async function seedUsers(prisma: PrismaClient, plano: PlanoDoSeed) {
  for (const { user: u, senha } of plano.contas) {
    // `update: {}` — só cria na ausência; rodar de novo não sobrescreve o que
    // já foi editado pelo time (nome, cor, role_label, senha) depois do primeiro boot.
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
  console.log(`✔ Pessoas: ${plano.contas.map((c) => `${c.user.email} (senha: ${c.origem})`).join(', ')}`);
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const plano = planoDoSeed();
    await seedUsers(prisma, plano);
    await seedTemplateActions(prisma);
    await seedPraca(prisma, { demo: plano.demo });
    // Produção nasce sem leads e sem mídia de exemplo (dados fictícios).
    if (plano.demo) await seedLeads(prisma);
    await seedMsgTemplates(prisma);
    await seedAppSettings(prisma);
    await seedCadences(prisma);
    if (plano.demo) await seedMidia(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
