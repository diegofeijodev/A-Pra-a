import type { PrismaService } from '../../../common/database/prisma.service';
import { PracasService } from '../pracas.service';

/**
 * Redesenho de 26/10, E5.2, lacuna G2 (contrato §6): `leads_count` em todo `PracaView` = leads da praça com
 * `archived = false` e `is_test = false` (a base do §34.6). Na lista, UM `groupBy` para todas (sem N+1).
 */
const A = '00000000-0000-4000-8000-0000000000a1';
const B = '00000000-0000-4000-8000-0000000000b2';
const C = '00000000-0000-4000-8000-0000000000c3';

const linha = (id: string, name: string) => ({
  id,
  name,
  city: 'Belo Horizonte · MG',
  start_date: '2026-09-01',
  end_date: '2026-12-08',
  cobertura_uf: null,
  cobertura_cidade: null,
  cobertura_ibge: null,
  lat: null,
  lon: null,
  vizinhas: [],
  created_at: new Date('2026-09-01T12:00:00.000Z'),
  step_states: [],
});

const BASE = { archived: false, is_test: false };

function montar(grupos: { praca_id: string | null; _count: { _all: number } }[], contagem = 0) {
  const p = {
    pracas: {
      findMany: jest.fn().mockResolvedValue([linha(A, 'Moema'), linha(B, 'Savassi'), linha(C, 'Centro')]),
      findUnique: jest.fn().mockResolvedValue(linha(B, 'Savassi')),
    },
    leads: {
      groupBy: jest.fn().mockResolvedValue(grupos),
      count: jest.fn().mockResolvedValue(contagem),
    },
  };
  return { p, s: new PracasService(p as unknown as PrismaService, null as never) };
}

describe('PracasService — leads_count (G2, contrato §6)', () => {
  it('lista: a contagem de cada praça vem de UM groupBy por praca_id (sem N+1)', async () => {
    const { p, s } = montar([
      { praca_id: A, _count: { _all: 41 } },
      { praca_id: C, _count: { _all: 3 } },
    ]);
    const lista = await s.list();
    expect(lista.map((x) => [x.name, x.leads_count])).toEqual([
      ['Moema', 41],
      ['Savassi', 0],
      ['Centro', 3],
    ]);
    expect(p.leads.groupBy).toHaveBeenCalledTimes(1);
    expect(p.leads.count).not.toHaveBeenCalled();
  });

  it('lista: arquivado e lead de teste ficam fora (o where do groupBy), só as praças da lista', async () => {
    const { p, s } = montar([]);
    await s.list();
    const arg = p.leads.groupBy.mock.calls[0][0];
    expect(arg.by).toEqual(['praca_id']);
    expect(arg.where).toEqual({ ...BASE, praca_id: { in: [A, B, C] } });
    expect(arg._count).toEqual({ _all: true });
  });

  it('lista: praça sem lead = 0 (nunca ausente nem nulo)', async () => {
    const { s } = montar([]);
    expect((await s.list()).map((x) => x.leads_count)).toEqual([0, 0, 0]);
  });

  it('lista vazia: nem chama o groupBy', async () => {
    const { p, s } = montar([]);
    p.pracas.findMany.mockResolvedValue([]);
    await expect(s.list()).resolves.toEqual([]);
    expect(p.leads.groupBy).not.toHaveBeenCalled();
  });

  it('uma praça (GET /:id, e o que POST e PATCH devolvem): um count com a mesma base', async () => {
    const { p, s } = montar([], 12);
    const v = await s.get(B);
    expect(v.leads_count).toBe(12);
    expect(p.leads.count).toHaveBeenCalledWith({ where: { ...BASE, praca_id: B } });
    expect(p.leads.groupBy).not.toHaveBeenCalled();
  });
});
