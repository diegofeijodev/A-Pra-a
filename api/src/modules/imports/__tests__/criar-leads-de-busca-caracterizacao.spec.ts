import type { Prisma } from '@prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import type { PrismaService } from '../../../common/database/prisma.service';
import { todaySp } from '../../../common/time/dates';
import { ImportsService } from '../imports.service';

/**
 * Caracterização do `criarLeadsDeBusca` de ANTES do A1 (CRM automático, tarefa 12): congela, sem `opcoes`, o `data` que vai a
 * `import_batches.create`, `leads.createMany` e `lead_events.createMany` (rodízio de donos, dono do lote, `author_id` do usuário)
 * e as leituras que decidem o dono. Não editar para "fazer passar": caso novo vai em arquivo novo.
 *
 * Os ids são `randomUUID()` e a hora é `new Date()`: ficam marcados (`<uuid-n>` pela ordem em que aparecem, `<agora>`, `<hoje>`),
 * e as ligações entre eles (lead ↔ evento, lote ↔ lead, a mesma hora nos três) são conferidas à parte.
 */

const PRACA = '00000000-0000-4000-8000-0000000000aa';
const U1 = '00000000-0000-4000-8000-000000000011';
const U2 = '00000000-0000-4000-8000-000000000022';
const MALL = '00000000-0000-4000-8000-0000000000bb';
const ADMIN: AuthUser = { id: U1, email: 'a@a.com', name: 'A', is_admin: true };
const EQUIPE: AuthUser = { id: U2, email: 'e@a.com', name: 'E', is_admin: false };
const FIXOS = new Set([PRACA, U1, U2, MALL]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const item = (n: number, over: Record<string, unknown> = {}) => ({
  name: `Lugar ${n}`, address: `Rua ${n}`, phone: '', site: null, lat: -23.6 - n / 1000, lng: -46.66,
  location_precision: 'point', source: 'osm', source_ref: `node/${n}`, ...over,
});

function setup(usuariosAtivos: { id: string }[] = [{ id: U1 }, { id: U2 }]) {
  const tx = {
    pracas: { findUnique: jest.fn().mockResolvedValue({ city: 'São Paulo' }) },
    users: { findMany: jest.fn().mockResolvedValue(usuariosAtivos), count: jest.fn().mockResolvedValue(1) },
    import_batches: { create: jest.fn().mockResolvedValue({}) },
    leads: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
    lead_events: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
  };
  const service = new ImportsService({} as unknown as PrismaService);
  return { tx, service };
}

type Tx = ReturnType<typeof setup>['tx'];

/**
 * Troca cada uuid gerado por `<uuid-n>` (o mesmo valor vira o mesmo marcador), a hora por `<agora>` e o dia de entrada por `<hoje>`
 * (que ele é o `todaySp()` é conferido em `conferirLigacoes`).
 */
function marcar(valor: unknown): unknown {
  const nomes = new Map<string, string>();
  const anda = (v: unknown): unknown => {
    if (v instanceof Date) return '<agora>';
    if (typeof v === 'string' && UUID.test(v) && !FIXOS.has(v)) {
      if (!nomes.has(v)) nomes.set(v, `<uuid-${nomes.size + 1}>`);
      return nomes.get(v);
    }
    if (Array.isArray(v)) return v.map(anda);
    if (v && typeof v === 'object') {
      return Object.fromEntries(
        Object.entries(v).map(([k, x]) => [
          k,
          (k === 'entered_at' || k === 'stage_since') && typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) ? '<hoje>' : anda(x),
        ]),
      );
    }
    return v;
  };
  return anda(valor);
}

/** Tudo o que o método mandou ao banco, na ordem das chamadas de cada tabela, mais o que devolveu. */
function gravado(tx: Tx, retorno: unknown) {
  return marcar({
    leituras: {
      pracas_findUnique: tx.pracas.findUnique.mock.calls.map((c) => c[0]),
      users_findMany: tx.users.findMany.mock.calls.map((c) => c[0]),
      users_count: tx.users.count.mock.calls.map((c) => c[0]),
    },
    import_batches_create: tx.import_batches.create.mock.calls.map((c) => c[0]),
    leads_createMany: tx.leads.createMany.mock.calls.map((c) => c[0]),
    lead_events_createMany: tx.lead_events.createMany.mock.calls.map((c) => c[0]),
    retorno,
  });
}

/** Ligações que o marcador esconde: o mesmo lote em tudo, um evento por lead (mesma ordem), a mesma hora nos três. */
function conferirLigacoes(tx: Tx, retorno: { batch_id: string; leads: { source_ref: string; lead_id: string }[] }) {
  const lote = tx.import_batches.create.mock.calls[0]![0].data as { id: string; at: Date };
  const leads = tx.leads.createMany.mock.calls[0]![0].data as { id: string; import_batch_id: string; entered_at: string; stage_since: string }[];
  const eventos = tx.lead_events.createMany.mock.calls[0]![0].data as { lead_id: string; at: Date }[];
  expect(lote.id).toBe(retorno.batch_id);
  expect(leads.every((l) => l.import_batch_id === lote.id)).toBe(true);
  expect(eventos.map((e) => e.lead_id)).toEqual(leads.map((l) => l.id));
  expect(retorno.leads.map((l) => l.lead_id)).toEqual(leads.map((l) => l.id));
  expect(eventos.every((e) => e.at === lote.at)).toBe(true);
  expect(leads.every((l) => l.entered_at === todaySp() && l.stage_since === todaySp())).toBe(true);
  expect(new Set([lote.id, ...leads.map((l) => l.id)]).size).toBe(leads.length + 1);
}

describe('criarLeadsDeBusca — caracterização (sem opcoes = o de antes do A1)', () => {
  it('rodízio de donos (todos os ativos), telefone com e sem número, site, evento com o author_id do usuário', async () => {
    const { tx, service } = setup();
    const r = await service.criarLeadsDeBusca(
      tx as unknown as Prisma.TransactionClient,
      {
        praca_id: PRACA,
        file_name: 'Busca 19/10 · Moema (OSM)',
        origem: 'pesquisa automática',
        itens: [item(1, { phone: '(11) 3333-4444', site: 'https://x.test' }), item(2), item(3, { phone: '11 98888-7777' })],
      },
      ADMIN,
    );
    conferirLigacoes(tx, r);
    expect(gravado(tx, r)).toMatchSnapshot();
  });

  it('dono escolhido (owner_id) vale para todos; usuário da equipe no lote e nos eventos', async () => {
    const { tx, service } = setup();
    const r = await service.criarLeadsDeBusca(
      tx as unknown as Prisma.TransactionClient,
      { praca_id: PRACA, file_name: 'Busca 20/10 · Centro (Apify)', origem: 'pesquisa automática', owner_id: U2, itens: [item(1, { source: 'apify', source_ref: 'ChIJ1' }), item(2, { source: 'apify', source_ref: 'ChIJ2' })] },
      EQUIPE,
    );
    conferirLigacoes(tx, r);
    expect(gravado(tx, r)).toMatchSnapshot();
  });

  it('lote D: shopping marcado (place_kind) e loja de dentro (parent_lead_id); um só ativo no rodízio', async () => {
    const { tx, service } = setup([{ id: U2 }]);
    const shopping = await service.criarLeadsDeBusca(
      tx as unknown as Prisma.TransactionClient,
      { praca_id: PRACA, file_name: 'Busca 21/10 · Shoppings (OSM)', origem: 'pesquisa automática', itens: [item(7, { source_ref: 'way/7', place_kind: 'shopping' })] },
      ADMIN,
    );
    conferirLigacoes(tx, shopping);
    expect(gravado(tx, shopping)).toMatchSnapshot('shopping');

    const b = setup([{ id: U1 }, { id: U2 }]);
    const lojas = await b.service.criarLeadsDeBusca(
      b.tx as unknown as Prisma.TransactionClient,
      { praca_id: PRACA, file_name: 'Busca 21/10 · Lojas (OSM)', origem: 'pesquisa automática', itens: [item(8, { parent_lead_id: MALL }), item(9, { parent_lead_id: MALL })] },
      ADMIN,
    );
    conferirLigacoes(b.tx, lojas);
    expect(gravado(b.tx, lojas)).toMatchSnapshot('lojas');
  });

  it('ninguém ativo => 400 NO_OWNERS e nada gravado', async () => {
    const { tx, service } = setup([]);
    await expect(
      service.criarLeadsDeBusca(
        tx as unknown as Prisma.TransactionClient,
        { praca_id: PRACA, file_name: 'x', origem: 'pesquisa automática', itens: [item(1)] },
        ADMIN,
      ),
    ).rejects.toMatchObject({ response: { code: 'NO_OWNERS' } });
    expect(tx.import_batches.create).not.toHaveBeenCalled();
    expect(tx.leads.createMany).not.toHaveBeenCalled();
    expect(tx.lead_events.createMany).not.toHaveBeenCalled();
  });
});
