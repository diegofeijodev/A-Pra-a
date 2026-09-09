/**
 * Praça de demonstração — a mesma do protótipo (`store.tsx:120-127`):
 * "Belo Horizonte + Contagem", de 01/09 a 08/12/2026, com o resultado 22 na
 * etapa 2 (abaixo do portão de 40, então a etapa 3 nasce travada) e o roteiro
 * inteiro já instanciado como ações.
 *
 * Idempotente: id fixo com `update: {}`, e as ações só são criadas se a praça
 * ainda não tiver nenhuma — rodar o seed de novo não duplica nem apaga o que o
 * time já concluiu.
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { SEED_USER_IDS } from '../seed';

export const SEED_PRACA_ID = '00000000-0000-4000-8000-0000000000aa';

export async function seedPraca(prisma: PrismaClient) {
  await prisma.pracas.upsert({
    where: { id: SEED_PRACA_ID },
    update: {},
    create: {
      id: SEED_PRACA_ID,
      name: 'Belo Horizonte + Contagem',
      city: 'Belo Horizonte · MG',
      start_date: '2026-09-01',
      end_date: '2026-12-08',
    },
  });

  await prisma.praca_step_states.upsert({
    where: { praca_id_step_n: { praca_id: SEED_PRACA_ID, step_n: 2 } },
    update: {},
    create: { praca_id: SEED_PRACA_ID, step_n: 2, actual: 22 },
  });

  const jaTem = await prisma.actions.count({ where: { praca_id: SEED_PRACA_ID } });
  if (jaTem === 0) {
    // Mesma instanciação de `PracasService.create` (ids gerados aqui para
    // caber em dois `createMany`): as colunas de `template_actions` e de
    // `actions` são as mesmas, e `how_to` vira subitem. Mudou lá, mude aqui.
    const templates = await prisma.template_actions.findMany({ orderBy: [{ sort: 'asc' }, { key: 'asc' }] });
    const acoes = templates.map((t) => {
      const { id: _id, key, how_to: _how, ...cols } = t;
      void _id;
      void _how;
      return { ...cols, id: randomUUID(), praca_id: SEED_PRACA_ID, template_key: key };
    });
    const subitens = templates.flatMap((t, i) =>
      t.how_to.map((text, sort) => ({ action_id: acoes[i]!.id, text, sort })),
    );
    if (acoes.length) await prisma.actions.createMany({ data: acoes });
    if (subitens.length) await prisma.action_subitems.createMany({ data: subitens });
  }

  // Só preenche quem ainda não escolheu praça: o seed não tira ninguém da
  // praça em que já está trabalhando.
  await prisma.users.updateMany({
    where: { id: { in: Object.values(SEED_USER_IDS) }, active_praca_id: null },
    data: { active_praca_id: SEED_PRACA_ID },
  });

  const total = await prisma.actions.count({ where: { praca_id: SEED_PRACA_ID } });
  console.log(`✔ Praça: Belo Horizonte + Contagem (${total} ações)`);
}
