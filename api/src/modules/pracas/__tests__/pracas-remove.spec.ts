import type { PrismaService } from '../../../common/database/prisma.service';
import { PracasService } from '../pracas.service';

const PRACA = '00000000-0000-4000-8000-0000000000aa';

describe('PracasService.remove — consultores de campo na praça', () => {
  it('praça com consultor = 409 PRACA_HAS_CONSULTANTS (a FK é Restrict; sem isto viraria 500)', async () => {
    const p = {
      pracas: { findUnique: jest.fn().mockResolvedValue({ id: PRACA, step_states: [] }), delete: jest.fn() },
      field_consultants: { count: jest.fn().mockResolvedValue(2) },
      users: { updateMany: jest.fn() },
      $transaction: jest.fn(),
    };
    const s = new PracasService(p as unknown as PrismaService, null as never);

    await expect(s.remove(PRACA)).rejects.toMatchObject({ status: 409, response: { code: 'PRACA_HAS_CONSULTANTS' } });
    expect(p.$transaction).not.toHaveBeenCalled();
  });
});
