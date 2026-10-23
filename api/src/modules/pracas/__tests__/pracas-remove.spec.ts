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

describe('PracasService.remove — lote F2 (§44.7): o conjunto e as jornadas também seguram a praça', () => {
  const montar = (noConjunto: number, jornadas: number) => {
    const p = {
      pracas: { findUnique: jest.fn().mockResolvedValue({ id: PRACA, step_states: [] }), delete: jest.fn() },
      field_consultants: { count: jest.fn().mockResolvedValue(0) },
      field_consultant_pracas: { count: jest.fn().mockResolvedValue(noConjunto) },
      field_journeys: { count: jest.fn().mockResolvedValue(jornadas) },
      users: { updateMany: jest.fn() },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    return { p, s: new PracasService(p as unknown as PrismaService, null as never) };
  };
  it('praça no conjunto de algum consultor = 409 PRACA_HAS_CONSULTANTS', async () => {
    const { p, s } = montar(1, 0);
    await expect(s.remove(PRACA)).rejects.toMatchObject({ status: 409, response: { code: 'PRACA_HAS_CONSULTANTS' } });
    expect(p.$transaction).not.toHaveBeenCalled();
  });
  it('praça com jornada gravada = 409 PRACA_HAS_JOURNEYS', async () => {
    const { p, s } = montar(0, 3);
    await expect(s.remove(PRACA)).rejects.toMatchObject({ status: 409, response: { code: 'PRACA_HAS_JOURNEYS' } });
    expect(p.$transaction).not.toHaveBeenCalled();
  });
  it('sem nada = apaga como hoje', async () => {
    const { p, s } = montar(0, 0);
    await expect(s.remove(PRACA)).resolves.toEqual({ ok: true });
    expect(p.$transaction).toHaveBeenCalled();
  });
});
