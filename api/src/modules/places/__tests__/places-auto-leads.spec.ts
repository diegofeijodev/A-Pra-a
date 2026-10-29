import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import type { PrismaService } from '../../../common/database/prisma.service';
import { CRM_DESLIGADAS, type FlagsCrm } from '../../../common/flags/crm.flags';
import { todaySp } from '../../../common/time/dates';
import type { LugarNormalizado } from '../../../domain/places-rules';
import type { ImportsService } from '../../imports/imports.service';
import { PlacesSearchService } from '../places-search.service';
import type { BuscaParams, PlacesProvider } from '../providers/places-provider';

/**
 * A1 (CRM automático, contrato §47; arquitetura §2.3): busca de `lugares` que termina com `CRM_AUTO_LEADS_FROM_SEARCH_ENABLED`
 * ligada põe os achados `novo` no funil pelo MESMO `adicionar` do botão "Adicionar", sem dono e com autor "Automático", e grava
 * uma rodada em `crm_automation_runs`. Desligada (ou outra busca), nada muda.
 */

beforeAll(() => Logger.overrideLogger(false));

const PRACA = '00000000-0000-4000-8000-0000000000aa';
const AREA = '00000000-0000-4000-8000-0000000000cc';
const RUN = '00000000-0000-4000-8000-0000000000dd';
const QUEM_PEDIU = '00000000-0000-4000-8000-0000000000ee';
const ADMIN: AuthUser = { id: QUEM_PEDIU, email: 'a@a.com', name: 'A', is_admin: true };
const LIGADA: FlagsCrm = { ...CRM_DESLIGADAS, auto_leads: true };
const cid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const lugar = (over: Partial<LugarNormalizado> = {}): LugarNormalizado => ({
  name: 'Bar do Chico', category: 'bar', address: 'Av. Ibirapuera, 88', lat: -23.6008, lng: -46.665, location_precision: 'point',
  phone: '', website: null, source: 'osm', source_ref: 'node/1', closed: false, ...over,
});

const runRow = (over: Record<string, unknown> = {}) => ({
  id: RUN, praca_id: PRACA, area_id: AREA, area_name: 'Moema', source: 'osm', types: ['bar'], lat: -23.6003, lng: -46.665,
  radius_m: 1500, cache_key: 'k', status: 'done', found: 0, novos: 0, duplicados: 0, descartados: 0, truncated: false,
  reserved_places: 0, est_cost_usd: 0, error: null, requested_by: QUEM_PEDIU, created_at: new Date('2026-10-29T14:00:00Z'),
  started_at: new Date('2026-10-29T14:00:01Z'), finished_at: new Date('2026-10-29T14:00:05Z'), segments_snapshot: null,
  kind: 'lugares', parent_lead_id: null, ...over,
});

/** Achado `novo` gravado pela busca; cada um num ponto bem separado (nenhum é duplicado do outro pela distância). */
const candRow = (n: number, over: Record<string, unknown> = {}) => ({
  id: cid(n), run_id: RUN, source: 'osm', source_ref: `node/${n}`, name: `Lugar ${n}`, category: 'bar', address: `Rua ${n}`,
  lat: -23.6 - n * 0.01, lng: -46.665, location_precision: 'point', phone: '', website: null, distance_m: n * 10,
  status: 'novo', reason: null, lead_id: null, metrics: null, created_at: new Date(), ...over,
});

type Cand = ReturnType<typeof candRow>;

function setup(o: {
  flags?: FlagsCrm;
  /** A busca relida pela `executar` (o `kind` sai daqui). */
  rodando?: Record<string, unknown>;
  /** A busca relida pelo A1 depois de concluída. */
  concluida?: Record<string, unknown> | null;
  candidatos?: Cand[];
  leads?: unknown[];
  /** Reserva atômica: quantos o `updateMany` de `novo` → `adicionado` pegou (padrão: todos). */
  reservados?: number;
} = {}) {
  const candidatos = o.candidatos ?? [candRow(1), candRow(2)];
  const osm: PlacesProvider = { id: 'osm', disponivel: () => true, buscar: jest.fn(async (_p: BuscaParams) => [lugar()]) };
  const apify: PlacesProvider = { id: 'apify', disponivel: () => false, buscar: jest.fn() };
  const place_import_runs = {
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockImplementation(({ data }) => Promise.resolve(runRow({ ...data, status: 'queued' }))),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    findUniqueOrThrow: jest.fn().mockResolvedValue(runRow({ status: 'running', ...o.rodando })),
    findUnique: jest.fn().mockResolvedValue(o.concluida === null ? null : runRow(o.concluida ?? {})),
    aggregate: jest.fn().mockResolvedValue({ _sum: { reserved_places: 0 } }),
  };
  const place_candidates = {
    // Duas leituras: a lista dos `novo` do A1 (respeita o `orderBy`) e a de dentro do `adicionar` (por `id in`).
    findMany: jest.fn(async (args: { where: { status?: string; id?: { in: string[] } }; orderBy?: unknown }) => {
      if (args.where.id?.in) return candidatos.filter((c) => args.where.id!.in.includes(c.id));
      const lista = candidatos.filter((c) => !args.where.status || c.status === args.where.status);
      return args.orderBy ? [...lista].sort((a, b) => a.distance_m - b.distance_m || a.name.localeCompare(b.name)) : lista;
    }),
    createMany: jest.fn().mockResolvedValue({ count: 0 }),
    update: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn(async (args: { where: { id: { in: string[] } } }) => ({ count: o.reservados ?? args.where.id.in.length })),
  };
  const prisma = {
    pracas: { findUnique: jest.fn().mockResolvedValue({ id: PRACA }) },
    field_areas: { findFirst: jest.fn().mockResolvedValue({ id: AREA, praca_id: PRACA, name: 'Moema', lat: -23.6003, lng: -46.665, radius_m: 1500, active: true }) },
    place_import_runs,
    place_candidates,
    leads: { findMany: jest.fn().mockResolvedValue(o.leads ?? []) },
    lead_mall_metrics: { createMany: jest.fn(), updateMany: jest.fn() },
    crm_automation_runs: { create: jest.fn().mockResolvedValue({}) },
    $transaction: jest.fn(),
  };
  (prisma.$transaction as jest.Mock).mockImplementation((fn: (tx: unknown) => unknown) => fn(prisma));
  const imports = {
    criarLeadsDeBusca: jest.fn().mockImplementation(async (_tx, input: { itens: { source_ref: string }[] }) => ({
      batch_id: 'batch-auto',
      leads: input.itens.map((i, n) => ({ source_ref: i.source_ref, lead_id: `lead-${n}` })),
    })),
  };
  const service = new PlacesSearchService(
    prisma as unknown as PrismaService,
    imports as unknown as ImportsService,
    { osm, apify },
    { apifyMaxPerRun: 300, apifyMonthlyCap: 3000 },
    undefined,
    undefined,
    o.flags,
  );
  return { service, prisma, place_import_runs, place_candidates, imports };
}

/** Pede uma busca de `lugares` e espera a fila (busca → concluir → gancho do A1). */
async function buscar(s: ReturnType<typeof setup>) {
  await s.service.start({ praca_id: PRACA, area_id: AREA, types: ['bar'] }, ADMIN);
  await s.service.aguardarFila();
}

const rodadas = (s: ReturnType<typeof setup>) => s.prisma.crm_automation_runs.create.mock.calls.map((c) => c[0].data as Record<string, unknown>);
const rotuloHoje = () => {
  const [, m, d] = todaySp().split('-');
  return `${d}/${m}`;
};

describe('A1 — chave ligada e busca de lugares concluída', () => {
  it('os achados novo viram leads pelo caminho do "Adicionar": sem dono, autor Automático, lote "Busca automática dd/mm · área (OSM)"', async () => {
    const s = setup({ flags: LIGADA });
    await buscar(s);

    expect(s.imports.criarLeadsDeBusca).toHaveBeenCalledTimes(1);
    const [, input, user, opcoes] = s.imports.criarLeadsDeBusca.mock.calls[0]!;
    expect(input.file_name).toBe(`Busca automática ${rotuloHoje()} · Moema (OSM)`);
    expect(input).toMatchObject({ praca_id: PRACA, origem: 'pesquisa automática' });
    expect(input.owner_id).toBeUndefined();
    expect(input.itens.map((i: { source_ref: string }) => i.source_ref)).toEqual(['node/1', 'node/2']);
    // `user` só para o `by` do lote: quem pediu a busca.
    expect(user).toEqual({ id: QUEM_PEDIU });
    expect(opcoes).toEqual({ sem_dono: true, autor_label: 'Automático' });

    // A mesma reserva atômica do botão e o candidato ligado ao lead.
    expect(s.place_candidates.updateMany).toHaveBeenCalledWith({
      where: { run_id: RUN, id: { in: [cid(1), cid(2)] }, status: 'novo' },
      data: { status: 'adicionado' },
    });
    expect(s.place_candidates.update).toHaveBeenCalledWith({ where: { id: cid(1) }, data: { lead_id: 'lead-0' } });

    // Relê a busca concluída e lista os `novo` pela distância.
    expect(s.place_import_runs.findUnique).toHaveBeenCalledWith({ where: { id: RUN } });
    expect(s.place_candidates.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { run_id: RUN, status: 'novo' }, orderBy: [{ distance_m: 'asc' }, { name: 'asc' }] }),
    );
    // Transação com as mesmas folgas do botão.
    expect(s.prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { timeout: 60_000, maxWait: 20_000 });
  });

  it('a rodada vai para crm_automation_runs (job auto_leads_busca, ref = a busca) com a conta', async () => {
    const s = setup({ flags: LIGADA });
    await buscar(s);
    expect(rodadas(s)).toHaveLength(1);
    const r = rodadas(s)[0]!;
    expect(r).toMatchObject({
      job: 'auto_leads_busca',
      ref: RUN,
      ok: true,
      summary: { adicionados: 2, ja_na_praca: 0, acima_do_teto: 0 },
      error: null,
    });
    expect(r.started_at).toBeInstanceOf(Date);
    expect(r.finished_at).toBeInstanceOf(Date);
  });

  it('achado que virou lead depois da busca entra em ja_na_praca; o resto é adicionado', async () => {
    const s = setup({
      flags: LIGADA,
      leads: [{ id: 'L9', name: 'Lugar 2', address: 'Rua 2', phone: '', lat: -23.62, lng: -46.665, source: null, source_ref: null }],
      reservados: 1,
    });
    await s.service.adicionarSozinho(RUN);
    expect(s.imports.criarLeadsDeBusca.mock.calls[0]![1].itens.map((i: { source_ref: string }) => i.source_ref)).toEqual(['node/1']);
    expect(rodadas(s)[0]).toMatchObject({ ok: true, summary: { adicionados: 1, ja_na_praca: 1, acima_do_teto: 0 }, error: null });
  });
});

describe('A1 — quando NÃO roda', () => {
  it('chave desligada (provedor ausente ou com tudo false) => nada: nem relê a busca, nem cria lead, nem grava rodada', async () => {
    for (const flags of [undefined, CRM_DESLIGADAS]) {
      const s = setup({ flags });
      await buscar(s);
      expect(s.place_import_runs.findUnique).not.toHaveBeenCalled();
      expect(s.imports.criarLeadsDeBusca).not.toHaveBeenCalled();
      expect(s.prisma.crm_automation_runs.create).not.toHaveBeenCalled();
      // A busca terminou como sempre.
      expect(s.place_import_runs.updateMany.mock.calls.some((c) => c[0].data.status === 'done')).toBe(true);
    }
  });

  it('busca de shoppings (kind ≠ lugares) => nada', async () => {
    const s = setup({ flags: LIGADA, rodando: { kind: 'shoppings', area_id: null } });
    await buscar(s);
    expect(s.place_import_runs.findUnique).not.toHaveBeenCalled();
    expect(s.imports.criarLeadsDeBusca).not.toHaveBeenCalled();
    expect(s.prisma.crm_automation_runs.create).not.toHaveBeenCalled();
  });

  it('busca cancelada no meio (o "done" não pegou) => nada', async () => {
    const s = setup({ flags: LIGADA });
    s.place_import_runs.updateMany.mockImplementation(async ({ data }: { data: { status?: string } }) => ({ count: data.status === 'done' ? 0 : 1 }));
    await buscar(s);
    expect(s.imports.criarLeadsDeBusca).not.toHaveBeenCalled();
    expect(s.prisma.crm_automation_runs.create).not.toHaveBeenCalled();
  });

  it('chamado com uma busca que não está done (ou que sumiu) => nada', async () => {
    for (const concluida of [{ status: 'cancelled' }, null]) {
      const s = setup({ flags: LIGADA, concluida });
      await s.service.adicionarSozinho(RUN);
      expect(s.imports.criarLeadsDeBusca).not.toHaveBeenCalled();
      expect(s.prisma.crm_automation_runs.create).not.toHaveBeenCalled();
    }
  });
});

describe('A1 — nada a adicionar, conflito e erro', () => {
  it('NOTHING_TO_ADD (todos já são lead na praça agora) => rodada ok com 0 adicionados', async () => {
    const s = setup({
      flags: LIGADA,
      leads: [
        { id: 'L1', name: 'Lugar 1', address: 'Rua 1', phone: '', lat: -23.61, lng: -46.665, source: null, source_ref: null },
        { id: 'L2', name: 'Lugar 2', address: 'Rua 2', phone: '', lat: -23.62, lng: -46.665, source: null, source_ref: null },
      ],
    });
    await s.service.adicionarSozinho(RUN);
    expect(s.imports.criarLeadsDeBusca).not.toHaveBeenCalled();
    expect(rodadas(s)).toEqual([
      expect.objectContaining({ job: 'auto_leads_busca', ref: RUN, ok: true, summary: { adicionados: 0, ja_na_praca: 2, acima_do_teto: 0 }, error: null }),
    ]);
  });

  it('nenhum achado novo => rodada ok com zeros, sem abrir transação', async () => {
    const s = setup({ flags: LIGADA, candidatos: [candRow(1, { status: 'duplicado', reason: 'ja_na_praca' })] });
    await s.service.adicionarSozinho(RUN);
    expect(s.prisma.$transaction).not.toHaveBeenCalled();
    expect(rodadas(s)[0]).toMatchObject({ ok: true, summary: { adicionados: 0, ja_na_praca: 0, acima_do_teto: 0 }, error: null });
  });

  it('conflito na reserva (alguém adicionou no meio) => rodada com erro CONFLITO, a busca continua done e nada vai para o falhar', async () => {
    const s = setup({ flags: LIGADA, reservados: 1 });
    await buscar(s);
    expect(s.imports.criarLeadsDeBusca).not.toHaveBeenCalled();
    expect(rodadas(s)).toEqual([
      expect.objectContaining({ job: 'auto_leads_busca', ref: RUN, ok: false, error: 'CONFLITO', summary: { adicionados: 0, ja_na_praca: 0, acima_do_teto: 0 } }),
    ]);
    expect(s.place_import_runs.updateMany.mock.calls.some((c) => c[0].data.status === 'error')).toBe(false);
  });

  it('índice único estourado (source, source_ref) => também CONFLITO', async () => {
    const s = setup({ flags: LIGADA });
    s.imports.criarLeadsDeBusca.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('x', { code: 'P2002', clientVersion: 't' }));
    await s.service.adicionarSozinho(RUN);
    expect(rodadas(s)[0]).toMatchObject({ ok: false, error: 'CONFLITO' });
  });

  it('erro inesperado => rodada com erro genérico (sem a mensagem original) e a busca continua done', async () => {
    const s = setup({ flags: LIGADA });
    s.imports.criarLeadsDeBusca.mockRejectedValue(new Error('boom 11 98888-7777 https://x?token=segredo'));
    await buscar(s);
    const r = rodadas(s)[0]!;
    expect(r).toMatchObject({ job: 'auto_leads_busca', ref: RUN, ok: false });
    expect(typeof r.error).toBe('string');
    expect(String(r.error)).not.toMatch(/boom|segredo|98888/);
    expect(s.place_import_runs.updateMany.mock.calls.some((c) => c[0].data.status === 'error')).toBe(false);
  });

  it('nem a gravação da rodada falhando derruba a busca', async () => {
    const s = setup({ flags: LIGADA });
    s.prisma.crm_automation_runs.create.mockRejectedValue(new Error('banco fora'));
    await buscar(s);
    expect(s.imports.criarLeadsDeBusca).toHaveBeenCalledTimes(1);
    expect(s.place_import_runs.updateMany.mock.calls.some((c) => c[0].data.status === 'error')).toBe(false);
  });
});

describe('A1 — teto de 300 por busca', () => {
  it('mais de 300 novos => só os 300 de menor distance_m; o que sobra conta em acima_do_teto', async () => {
    // 302 achados embaralhados: o 301º e o 302º pela distância ficam de fora.
    const ordem = Array.from({ length: 302 }, (_, i) => i + 1).sort((a, b) => ((a * 7919) % 302) - ((b * 7919) % 302));
    const s = setup({ flags: LIGADA, candidatos: ordem.map((n) => candRow(n)) });
    await s.service.adicionarSozinho(RUN);
    const reserva = s.place_candidates.updateMany.mock.calls[0]![0] as { where: { id: { in: string[] } } };
    expect(reserva.where.id.in).toEqual(Array.from({ length: 300 }, (_, i) => cid(i + 1)));
    expect(s.imports.criarLeadsDeBusca.mock.calls[0]![1].itens).toHaveLength(300);
    expect(rodadas(s)[0]).toMatchObject({ ok: true, summary: { adicionados: 300, ja_na_praca: 0, acima_do_teto: 2 } });
  });
});
