import type { Prisma } from '@prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import type { PrismaService } from '../../../common/database/prisma.service';
import { ImportsService } from '../imports.service';

const PRACA = '00000000-0000-4000-8000-0000000000aa';
const U1 = '00000000-0000-4000-8000-000000000011';
const U2 = '00000000-0000-4000-8000-000000000022';
const ADMIN: AuthUser = { id: U1, email: 'a@a.com', name: 'A', is_admin: true };

const item = (n: number, over: Record<string, unknown> = {}) => ({
  name: `Lugar ${n}`,
  address: `Rua ${n}`,
  phone: '',
  site: null,
  lat: -23.6,
  lng: -46.66,
  location_precision: 'point',
  source: 'osm',
  source_ref: `node/${n}`,
  ...over,
});

function setup() {
  const tx = {
    pracas: { findUnique: jest.fn().mockResolvedValue({ city: 'São Paulo' }) },
    users: {
      findMany: jest.fn().mockResolvedValue([{ id: U1 }, { id: U2 }]),
      count: jest.fn().mockResolvedValue(1),
    },
    import_batches: { create: jest.fn().mockResolvedValue({}) },
    leads: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
    lead_events: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
  };
  const service = new ImportsService({} as unknown as PrismaService);
  return {
    tx,
    service,
    run: (input: Parameters<ImportsService['criarLeadsDeBusca']>[1]) =>
      service.criarLeadsDeBusca(tx as unknown as Prisma.TransactionClient, input, ADMIN),
  };
}

describe('ImportsService.criarLeadsDeBusca — mesmo caminho do import por arquivo', () => {
  it('cria o lote, os leads (etapa 1, classe alvo, coordenada, fonte, rodízio) e um evento por lead; telefone vazio é aceito', async () => {
    const { tx, run } = setup();
    const r = await run({
      praca_id: PRACA,
      file_name: 'Busca 19/10 · Moema (OSM)',
      origem: 'pesquisa automática',
      itens: [item(1, { phone: '(11) 3333-4444', site: 'https://x.test' }), item(2), item(3)],
    });
    expect(r.leads.map((l) => l.source_ref)).toEqual(['node/1', 'node/2', 'node/3']);
    expect(tx.import_batches.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: r.batch_id,
        file_name: 'Busca 19/10 · Moema (OSM)',
        by: U1,
        origem: 'pesquisa automática',
        imported: 3,
        ignored: 0,
      }),
    });
    const leads = tx.leads.createMany.mock.calls[0]![0].data as Record<string, unknown>[];
    expect(leads[0]).toMatchObject({
      praca_id: PRACA,
      city: 'São Paulo',
      name: 'Lugar 1',
      phone: '(11) 3333-4444',
      phone_key: '133334444',
      site: 'https://x.test',
      lat: -23.6,
      lng: -46.66,
      location_precision: 'point',
      source: 'osm',
      source_ref: 'node/1',
      classe: 'alvo',
      origem: 'pesquisa automática',
      stage: 1,
      import_batch_id: r.batch_id,
    });
    expect(leads[1]).toMatchObject({ phone: '', phone_key: '' });
    expect(leads.map((l) => l.owner_id)).toEqual([U1, U2, U1]);
    expect(tx.lead_events.createMany.mock.calls[0]![0].data).toHaveLength(3);
  });
  it('dono escolhido (owner_id) vale para todos', async () => {
    const { tx, run } = setup();
    await run({
      praca_id: PRACA,
      file_name: 'x',
      origem: 'pesquisa automática',
      owner_id: U2,
      itens: [item(1), item(2)],
    });
    expect(
      (tx.leads.createMany.mock.calls[0]![0].data as { owner_id: string }[]).map((l) => l.owner_id),
    ).toEqual([U2, U2]);
  });
  it('A1 (opcoes sem_dono + autor_label): lead sem dono, rodízio nem consultado, evento sem author_id e com o rótulo; lote com o by de quem pediu', async () => {
    const { tx, service } = setup();
    const r = await service.criarLeadsDeBusca(
      tx as unknown as Prisma.TransactionClient,
      {
        praca_id: PRACA,
        file_name: 'Busca automática 29/10 · Moema (OSM)',
        origem: 'pesquisa automática',
        owner_id: U2,
        itens: [item(1), item(2)],
      },
      { id: U2 },
      { sem_dono: true, autor_label: 'Automático' },
    );
    expect(tx.users.findMany).not.toHaveBeenCalled();
    expect(tx.users.count).not.toHaveBeenCalled();
    const leads = tx.leads.createMany.mock.calls[0]![0].data as Record<string, unknown>[];
    expect(leads.map((l) => l.owner_id)).toEqual([null, null]);
    expect(leads[0]).toMatchObject({
      classe: 'alvo',
      origem: 'pesquisa automática',
      stage: 1,
      import_batch_id: r.batch_id,
    });
    const eventos = tx.lead_events.createMany.mock.calls[0]![0].data as Record<string, unknown>[];
    expect(eventos).toHaveLength(2);
    for (const e of eventos) {
      expect(e).toMatchObject({
        author_id: null,
        author_label: 'Automático',
        kind: 'note',
        text: 'Lead criado por pesquisa automática · Busca automática 29/10 · Moema (OSM).',
      });
    }
    expect(tx.import_batches.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: r.batch_id,
        by: U2,
        file_name: 'Busca automática 29/10 · Moema (OSM)',
        imported: 2,
      }),
    });
  });
  it('sem opcoes o evento não ganha author_label (nem com undefined)', async () => {
    const { tx, run } = setup();
    await run({ praca_id: PRACA, file_name: 'x', origem: 'pesquisa automática', itens: [item(1)] });
    const [e] = tx.lead_events.createMany.mock.calls[0]![0].data as Record<string, unknown>[];
    expect(Object.keys(e!).sort()).toEqual(['at', 'author_id', 'kind', 'lead_id', 'text']);
    expect(e!.author_id).toBe(U1);
  });
  it('praça inexistente => 404', async () => {
    const { tx, run } = setup();
    tx.pracas.findUnique.mockResolvedValue(null);
    await expect(
      run({ praca_id: PRACA, file_name: 'x', origem: 'o', itens: [item(1)] }),
    ).rejects.toMatchObject({ response: { code: 'NOT_FOUND' } });
  });
});
