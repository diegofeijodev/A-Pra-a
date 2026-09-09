/**
 * As 5 cadências que já vêm montadas (`SEED_CADENCES` do catálogo).
 *
 * Idempotente **por nome**, não por id: a cadência nasce com uuid gerado (o
 * time renomeia, edita nós e apaga à vontade), então o que o seed garante é
 * "existe uma cadência com este nome". Rodar de novo não sobrescreve os nós que
 * o time já ajustou nem ressuscita a que foi apagada de propósito — para isso
 * existe o `POST /v1/cadences/restore-seed`, que é ato explícito da tela.
 *
 * Precisa rodar DEPOIS de `seedMsgTemplates`: os nós de mensagem apontam para
 * `SEED_TEMPLATE_IDS`.
 */
import { PrismaClient } from '@prisma/client';
import { SEED_CADENCES, seedCadenceNodeRows } from '../../src/domain/catalog/cadences';

export async function seedCadences(prisma: PrismaClient) {
  let criadas = 0;
  for (const c of SEED_CADENCES) {
    const ja = await prisma.cadences.count({ where: { name: c.name } });
    if (ja) continue;
    await prisma.cadences.create({
      data: {
        name: c.name,
        audience: c.audience,
        entry: c.entry,
        exit_action: c.exit_action,
        exit_note: c.exit_note,
        paused: c.paused,
        nodes: { create: seedCadenceNodeRows(c) },
      },
    });
    criadas++;
  }
  console.log(`✔ Cadências-modelo: ${SEED_CADENCES.length} (${criadas} criada(s) agora)`);
}
