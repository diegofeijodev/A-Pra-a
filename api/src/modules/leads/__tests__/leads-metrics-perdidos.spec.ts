import type { PrismaService } from '../../../common/database/prisma.service';
import { LeadsService } from '../leads.service';

const PRACA = '88888888-8888-4888-8888-888888888888';

/** Lead mínimo no formato que `metrics()` lê do `findMany` (colunas + timeline vazia). */
function lead(stage: number) {
  return {
    id: `lead-${stage}-${Math.random()}`,
    stage,
    stage_since: new Date('2026-10-01T12:00:00Z'),
    entered_at: '2026-10-01',
    archived: false,
    classe: 'B',
    last_contact_at: null,
    events: [],
    _count: { events: 0, vagas: 0 },
  };
}

function montar(etapas: number[]) {
  const prisma = {
    pracas: { findUnique: jest.fn().mockResolvedValue({ id: PRACA }) },
    leads: { findMany: jest.fn().mockResolvedValue(etapas.map(lead)) },
  };
  return new LeadsService(prisma as unknown as PrismaService);
}

describe('LeadsService.metrics — etapa 8 (Perdido) fora das taxas e conta de cada taxa (contrato §47.5)', () => {
  it('etapas [2,3,5,7,8,8]: 2 de 4 contatados, 1 de 2 cadastrados, 2 perdidos', async () => {
    const m = await montar([2, 3, 5, 7, 8, 8]).metrics({ praca_id: PRACA });
    expect(m).toMatchObject({
      conv_contact_n: 2,
      conv_contact_de: 4,
      conv_contact: 50,
      conv_active_n: 1,
      conv_active_de: 2,
      conv_active: 50,
      lost: 2,
    });
  });

  it('só perdidos: taxas zeradas, sem divisão por zero', async () => {
    const m = await montar([8, 8]).metrics({ praca_id: PRACA });
    expect(m).toMatchObject({ conv_contact_n: 0, conv_contact_de: 0, conv_contact: 0, conv_active_n: 0, conv_active_de: 0, conv_active: 0, lost: 2 });
  });
});
