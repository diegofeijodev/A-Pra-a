import type { PrismaService } from '../../../common/database/prisma.service';
import { CRM_DESLIGADAS, type FlagsCrm } from '../../../common/flags/crm.flags';
import type { FreelaClient } from '../../freela/freela-client';
import { AutomacoesService } from '../automacoes.service';

const PRACA = 'aaaaaaaa-0000-4000-8000-000000000001';
const L1 = 'eeeeeeee-0000-4000-8000-000000000001';
const L2 = 'eeeeeeee-0000-4000-8000-000000000002';
const L3 = 'eeeeeeee-0000-4000-8000-000000000003';
const EMAIL = 'conta.servico@freela.example';
const AGORA = new Date('2026-10-29T15:00:00.000Z');

type Row = Record<string, any>;
function montar(o: { flags?: Partial<FlagsCrm>; freela?: boolean; ultimas?: Record<string, Row>; rodadas?: Row[]; mode?: string | null; cadencias?: Row[]; ativas?: Row[]; ultimos?: Row[]; hirings?: Row[]; praca?: boolean } = {}) {
  const prisma: any = {
    crm_automation_runs: {
      findFirst: jest.fn(async (a: Row) => o.ultimas?.[a.where.job] ?? null),
      findMany: jest.fn(async () => o.rodadas ?? []),
    },
    app_settings: { findUnique: jest.fn(async () => (o.mode === null ? null : { mode: o.mode ?? 'fila' })) },
    cadences: { findMany: jest.fn(async () => o.cadencias ?? []) },
    enrollments: { groupBy: jest.fn(async () => o.ativas ?? []) },
    pracas: { findUnique: jest.fn(async () => (o.praca === false ? null : { id: PRACA })) },
    leads: { findMany: jest.fn(async () => o.hirings ?? []) },
    $queryRaw: jest.fn(async () => o.ultimos ?? []),
  };
  const freela = { isConfigured: () => o.freela ?? true, adminEmail: () => EMAIL } as unknown as FreelaClient;
  const svc = new AutomacoesService(prisma as PrismaService, freela, { ...CRM_DESLIGADAS, ...o.flags });
  return { svc, prisma };
}
const job = (r: { jobs: any[] }, k: string) => r.jobs.find((j) => j.key === k);

describe('AutomacoesService.automacoes', () => {
  const antes = process.env.FIELD_SIGNUP_SYNC_ENABLED;
  afterEach(() => {
    if (antes === undefined) delete process.env.FIELD_SIGNUP_SYNC_ENABLED;
    else process.env.FIELD_SIGNUP_SYNC_ENABLED = antes;
  });

  it('quatro trabalhos, enabled pelas chaves, send_mode de app_settings (padrão fila)', async () => {
    const { svc } = montar({ flags: { auto_lost: true }, mode: null });
    const r = await svc.automacoes(false, AGORA);
    expect(r.jobs.map((j) => j.key)).toEqual(['auto_leads_busca', 'etapas_cadastro', 'quadro_freela', 'sem_resposta']);
    expect(job(r, 'sem_resposta').enabled).toBe(true);
    expect(job(r, 'auto_leads_busca').enabled).toBe(false);
    expect(r.send_mode).toBe('fila');
    expect(job(r, 'quadro_freela').needs_freela).toBe(true);
    expect(job(r, 'sem_resposta').needs_freela).toBe(false);
  });

  it("blocked_by 'freela' para quadro_freela sem conta; os outros sem Freela não dependem dela", async () => {
    const { svc } = montar({ freela: false });
    const r = await svc.automacoes(false, AGORA);
    expect(job(r, 'quadro_freela').blocked_by).toBe('freela');
    expect(job(r, 'sem_resposta').blocked_by).toBeNull();
    expect(job(r, 'auto_leads_busca').blocked_by).toBeNull();
    expect(r.freela_configured).toBe(false);
  });

  it("blocked_by 'signup_sync' para etapas_cadastro com o sync desligado; ligado = livre", async () => {
    process.env.FIELD_SIGNUP_SYNC_ENABLED = 'false';
    expect(job(await montar().svc.automacoes(false, AGORA), 'etapas_cadastro').blocked_by).toBe('signup_sync');
    process.env.FIELD_SIGNUP_SYNC_ENABLED = 'true';
    expect(job(await montar().svc.automacoes(false, AGORA), 'etapas_cadastro').blocked_by).toBeNull();
    expect(job(await montar({ freela: false }).svc.automacoes(false, AGORA), 'etapas_cadastro').blocked_by).toBe('freela');
  });

  it('equipe não recebe error; admin recebe; nunca o e-mail da conta', async () => {
    const ultimas = {
      sem_resposta: { started_at: new Date('2026-10-29T10:00:00Z'), finished_at: new Date('2026-10-29T10:00:05Z'), ok: false, summary: { perdidos: 0 }, error: 'CRM_ERROR: A rodada falhou.' },
    };
    const eq = await montar({ ultimas }).svc.automacoes(false, AGORA);
    expect(job(eq, 'sem_resposta').last_run).toEqual({ at: '2026-10-29T10:00:05.000Z', ok: false, summary: { perdidos: 0 } });
    expect('error' in job(eq, 'sem_resposta').last_run).toBe(false);
    const ad = await montar({ ultimas }).svc.automacoes(true, AGORA);
    expect(job(ad, 'sem_resposta').last_run.error).toBe('CRM_ERROR: A rodada falhou.');
    expect(JSON.stringify([eq, ad])).not.toContain(EMAIL);
    expect(job(eq, 'quadro_freela').last_run).toBeNull();
  });

  it('last_7d soma os campos numéricos (aninhados com ponto) e pula nao_configurado', async () => {
    const { svc, prisma } = montar({
      rodadas: [
        { job: 'quadro_freela', summary: { cartoes: 10, criados: 1, etapas: { '5': 2, '6': 0, '7': 1 }, texto: 'x' } },
        { job: 'quadro_freela', summary: { cartoes: 5, criados: 0, etapas: { '5': 1, '6': 1, '7': 0 } } },
        { job: 'quadro_freela', summary: { nao_configurado: true } },
        { job: 'sem_resposta', summary: { perdidos: 3 } },
      ],
    });
    const r = await svc.automacoes(false, AGORA);
    expect(job(r, 'quadro_freela').last_7d).toEqual({ cartoes: 15, criados: 1, 'etapas.5': 3, 'etapas.6': 1, 'etapas.7': 1 });
    expect(job(r, 'sem_resposta').last_7d).toEqual({ perdidos: 3 });
    expect(job(r, 'auto_leads_busca').last_7d).toEqual({});
    expect(prisma.crm_automation_runs.findMany.mock.calls[0][0].where.started_at.gte).toEqual(new Date('2026-10-22T15:00:00.000Z'));
  });

  it('cadências com a contagem de inscrições ativas', async () => {
    const { svc, prisma } = montar({
      cadencias: [{ id: 'c1', name: 'Boas-vindas', entry: 'manual', paused: false }, { id: 'c2', name: 'Novo', entry: 'stage_novo', paused: true }],
      ativas: [{ cadence_id: 'c1', _count: { _all: 4 } }],
    });
    const r = await svc.automacoes(false, AGORA);
    expect(r.cadences).toEqual([
      { id: 'c1', name: 'Boas-vindas', entry: 'manual', paused: false, active_enrollments: 4 },
      { id: 'c2', name: 'Novo', entry: 'stage_novo', paused: true, active_enrollments: 0 },
    ]);
    expect(prisma.enrollments.groupBy.mock.calls[0][0].where).toEqual({ status: 'ativo' });
  });

  it('warnings: auto_leads ligada + cadência stage_novo não pausada; fora disso, vazio', async () => {
    const nova = (paused: boolean) => [{ id: 'c2', name: 'Novo', entry: 'stage_novo', paused }];
    const aviso = (await montar({ flags: { auto_leads: true }, cadencias: nova(false) }).svc.automacoes(false, AGORA)).warnings;
    expect(aviso).toHaveLength(1);
    expect(aviso[0]).toContain('Via Freela');
    expect((await montar({ flags: { auto_leads: true }, cadencias: nova(true) }).svc.automacoes(false, AGORA)).warnings).toEqual([]);
    expect((await montar({ cadencias: nova(false) }).svc.automacoes(false, AGORA)).warnings).toEqual([]);
    expect((await montar({ flags: { auto_leads: true }, cadencias: [{ id: 'c', name: 'x', entry: 'manual', paused: false }] }).svc.automacoes(false, AGORA)).warnings).toEqual([]);
  });
});

describe('AutomacoesService.selos', () => {
  it('praca_id malformado ou inexistente = 404 NOT_FOUND', async () => {
    const a = montar();
    await expect(a.svc.selos('xx')).rejects.toMatchObject({ response: { code: 'NOT_FOUND' } });
    expect(a.prisma.$queryRaw).not.toHaveBeenCalled();
    await expect(montar({ praca: false }).svc.selos(PRACA)).rejects.toMatchObject({ response: { code: 'NOT_FOUND' } });
  });

  it('só leads com algo a mostrar: último evento automático e/ou vagas pagas do Freela', async () => {
    const { svc, prisma } = montar({
      ultimos: [
        { lead_id: L1, author_id: null, author_label: 'Automático · Freela' },
        { lead_id: L2, author_id: 'u1', author_label: 'Ana' },
        { lead_id: L3, author_id: null, author_label: 'Freela (sincronização)' },
      ],
      hirings: [{ id: L1, freela_hirings: 2 }, { id: L2, freela_hirings: 1 }],
    });
    const r = await svc.selos(PRACA);
    expect(r.items).toEqual([
      { lead_id: L1, last_stage_auto: true, freela_hirings: 2 },
      { lead_id: L3, last_stage_auto: true, freela_hirings: null },
      { lead_id: L2, last_stage_auto: false, freela_hirings: 1 },
    ]);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    const sql = prisma.$queryRaw.mock.calls[0][0];
    expect(sql.values).toEqual([PRACA]);
    expect(sql.sql).toContain('DISTINCT ON (e.lead_id)');
  });

  it('nada a mostrar = lista vazia', async () => {
    expect((await montar().svc.selos(PRACA)).items).toEqual([]);
  });
});
