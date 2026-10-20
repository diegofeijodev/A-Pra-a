import type { PrismaService } from '../../../common/database/prisma.service';
import { LeadsService } from '../leads.service';

const ID = '77777777-7777-4777-8777-777777777777';

/** `remove` primeiro confere que o lead existe (`findOrFail`) e só então olha o roteiro. */
function montar(emRoteiro: number, declarados = 0) {
  const prisma = {
    leads: { findUnique: jest.fn().mockResolvedValue({ id: ID, events: [], vagas: [] }), findFirst: jest.fn().mockResolvedValue({ id: ID, events: [], vagas: [] }), delete: jest.fn().mockResolvedValue({}) },
    field_route_stops: { count: jest.fn().mockResolvedValue(emRoteiro) },
    field_declared_signups: { count: jest.fn().mockResolvedValue(declarados) },
  };
  const service = new LeadsService(prisma as unknown as PrismaService);
  jest.spyOn(service as unknown as { findOrFail: () => Promise<unknown> }, 'findOrFail').mockResolvedValue({ id: ID });
  return { service, prisma };
}

describe('LeadsService.remove — lead com parada de roteiro (contrato §23.5)', () => {
  it('lead em roteiro de campo: 409 LEAD_IN_ROUTE e nada é apagado (a FK é RESTRICT)', async () => {
    const { service, prisma } = montar(2);
    await expect(service.remove(ID)).rejects.toMatchObject({ status: 409, response: { code: 'LEAD_IN_ROUTE' } });
    expect(prisma.field_route_stops.count).toHaveBeenCalledWith({ where: { lead_id: ID } });
    expect(prisma.leads.delete).not.toHaveBeenCalled();
  });

  it('sem parada: apaga como antes', async () => {
    const { service, prisma } = montar(0);
    await expect(service.remove(ID)).resolves.toEqual({ ok: true });
    expect(prisma.leads.delete).toHaveBeenCalledWith({ where: { id: ID } });
  });

  it('lead com cadastro declarado (fato imutável, §32.8): 409 HAS_DECLARED_SIGNUP e nada é apagado', async () => {
    const { service, prisma } = montar(0, 1);
    await expect(service.remove(ID)).rejects.toMatchObject({ status: 409, response: { code: 'HAS_DECLARED_SIGNUP' } });
    expect(prisma.leads.delete).not.toHaveBeenCalled();
  });
});
