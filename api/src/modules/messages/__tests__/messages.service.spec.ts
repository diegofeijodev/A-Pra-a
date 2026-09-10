/**
 * `DELETE /v1/msg-templates/:id` — a guarda do modelo em uso (§12).
 *
 * `cadence_nodes.template_id` não tem FK (o nó guarda o id solto, por desenho).
 * Sem a guarda, apagar um modelo citado por um passo deixava o nó apontando
 * para o nada e o motor gravava `msg_sends` com **texto vazio**: em modo `fila`
 * o operador copiava uma mensagem em branco, em modo `freela` subia
 * `whatsappTemplate: ""`. Silencioso nos dois casos — e as 5 cadências-modelo
 * citam os 8 modelos semeados, então era o caminho normal, não o exótico.
 */
import type { PrismaService } from '../../../common/database/prisma.service';
import type { LeadsService } from '../../leads/leads.service';
import { MessagesService } from '../messages.service';

const TEMPLATE = '55555555-5555-4555-8555-555555555555';

function fakePrisma(nos: { cadence: { name: string } }[] = []) {
  return {
    msg_templates: {
      findUnique: jest.fn().mockResolvedValue({ id: TEMPLATE, name: 'Toque 1' }),
      delete: jest.fn().mockResolvedValue({}),
    },
    cadence_nodes: { findMany: jest.fn().mockResolvedValue(nos) },
  };
}

const montar = (p: ReturnType<typeof fakePrisma>) =>
  new MessagesService(p as unknown as PrismaService, {} as unknown as LeadsService);

describe('MessagesService.removeTemplate', () => {
  it('modelo sem nenhum passo apontando para ele é apagado', async () => {
    const p = fakePrisma();

    await expect(montar(p).removeTemplate(TEMPLATE)).resolves.toEqual({ ok: true });

    expect(p.cadence_nodes.findMany).toHaveBeenCalledWith({
      where: { template_id: TEMPLATE },
      select: { cadence: { select: { name: true } } },
    });
    expect(p.msg_templates.delete).toHaveBeenCalledWith({ where: { id: TEMPLATE } });
  });

  it('modelo usado por uma cadência é 409 TEMPLATE_IN_USE, com o nome da cadência', async () => {
    const p = fakePrisma([{ cadence: { name: 'Reaquecimento' } }]);

    await expect(montar(p).removeTemplate(TEMPLATE)).rejects.toMatchObject({
      response: { code: 'TEMPLATE_IN_USE', message: expect.stringContaining('Reaquecimento') },
    });
    expect(p.msg_templates.delete).not.toHaveBeenCalled();
  });

  it('duas cadências não repetem o mesmo nome na mensagem', async () => {
    const p = fakePrisma([
      { cadence: { name: 'Reaquecimento' } },
      { cadence: { name: 'Reaquecimento' } },
      { cadence: { name: 'Primeira vaga' } },
    ]);

    await expect(montar(p).removeTemplate(TEMPLATE)).rejects.toMatchObject({
      response: {
        code: 'TEMPLATE_IN_USE',
        message: 'Este modelo está em uso na cadência “Reaquecimento”, “Primeira vaga”. Troque o passo antes de apagar.',
      },
    });
  });

  it('id malformado continua 404, antes de olhar cadência', async () => {
    const p = fakePrisma();

    await expect(montar(p).removeTemplate('nao-e-uuid')).rejects.toMatchObject({
      response: { code: 'NOT_FOUND' },
    });
    expect(p.cadence_nodes.findMany).not.toHaveBeenCalled();
  });
});
