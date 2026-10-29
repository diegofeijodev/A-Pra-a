import type { PrismaService } from '../../../common/database/prisma.service';
import type { FlagsCrm } from '../../../common/flags/crm.flags';
import { CRM_DESLIGADAS } from '../../../common/flags/crm.flags';
import type { FreelaClient } from '../../freela/freela-client';
import type { RotasConfigService } from '../../rotas/rotas-config.service';
import { SignupSyncService } from '../signup-sync.service';

const A = 'aaaaaaaa-0000-4000-8000-000000000001';
const PRACA = '00000000-0000-4000-8000-0000000000aa';
const AGORA = new Date('2026-10-20T15:00:00.000Z');
const OPC = { janelaDias: 45 };
const WATERMARK = new Date('2026-10-19T10:00:00.000Z');

type Row = Record<string, any>;

function montar(signups: Row[], flags?: FlagsCrm) {
  const prisma: any = {
    field_consultants: { findMany: jest.fn(async () => [{ id: A, praca_id: PRACA, freela_consultant_id: 'fc-A' }]) },
    field_signup_sync_state: {
      findUnique: jest.fn(async () => ({ consultant_id: A, watermark: WATERMARK })),
      upsert: jest.fn(async () => undefined),
    },
    field_signups: {
      // Como o real: filtra pelo(s) campo(s) `*_at` nulos do where e ordena por freela_created_at.
      findFirst: jest.fn(async ({ where }: any) => {
        const campos = Object.keys(where).filter((k) => k.endsWith('_at'));
        return (
          signups
            .filter((s) => s.consultant_id === where.consultant_id && campos.every((c) => s[c] === null))
            .sort((a, b) => a.freela_created_at - b.freela_created_at)[0] ?? null
        );
      }),
    },
    // Leads voltados de 5–7 (só com a chave ligada): nenhum aqui.
    lead_events: { findMany: jest.fn(async () => []) },
  };
  const list = jest.fn(async () => ({ data: [], nextCursor: null }));
  const freela = { listRegistrations: list } as unknown as FreelaClient;
  const config = { cadastro: async () => ({ confirmation_rule: 'activated' }) } as unknown as RotasConfigService;
  const svc = new SignupSyncService(prisma as PrismaService, freela, config, undefined, flags);
  return { svc, prisma, list };
}

const sinal = (o: Row): Row => ({
  consultant_id: A,
  activated_at: null,
  first_vacancy_at: null,
  first_job_completed_at: null,
  ...o,
});

// X: ativou, ainda sem serviço concluído (criado em 01/10). Y: nem ativou (criado em 10/10).
const X = sinal({ freela_created_at: new Date('2026-10-01T10:00:00.000Z'), activated_at: new Date('2026-10-02T10:00:00.000Z') });
const Y = sinal({ freela_created_at: new Date('2026-10-10T10:00:00.000Z') });
const since = (t: ReturnType<typeof montar>) => (t.list.mock.calls[0] as any)[1].since;

describe('SignupSyncService com a chave auto_stages do CRM', () => {
  it('ligada: relê desde o cadastro ativado sem serviço concluído, se for mais antigo', async () => {
    const t = montar([X, Y], { ...CRM_DESLIGADAS, auto_stages: true });
    await t.svc.rodar(AGORA, OPC);
    expect(since(t)).toBe('2026-10-01T10:00:00.000Z');
    expect(t.prisma.field_signups.findFirst).toHaveBeenCalledTimes(2);
    expect(t.prisma.field_signups.findFirst.mock.calls[1][0]).toMatchObject({
      where: { consultant_id: A, first_job_completed_at: null },
      orderBy: { freela_created_at: 'asc' },
      select: { freela_created_at: true },
    });
  });

  it('ligada: continua preso ao piso da janela', async () => {
    const velho = sinal({ freela_created_at: new Date('2026-08-01T10:00:00.000Z'), activated_at: new Date('2026-08-02T10:00:00.000Z') });
    const t = montar([velho, Y], { ...CRM_DESLIGADAS, auto_stages: true });
    await t.svc.rodar(AGORA, OPC);
    expect(since(t)).toBe('2026-09-05T15:00:00.000Z');
  });

  it('ligada, sem cadastro sem serviço concluído: vale o de hoje', async () => {
    const feito = sinal({ ...X, first_job_completed_at: new Date('2026-10-05T10:00:00.000Z') });
    const t = montar([feito, Y], { ...CRM_DESLIGADAS, auto_stages: true });
    await t.svc.rodar(AGORA, OPC);
    expect(since(t)).toBe('2026-10-10T10:00:00.000Z');
  });

  it('desligada: o since de hoje e uma única consulta', async () => {
    const t = montar([X, Y], { ...CRM_DESLIGADAS });
    await t.svc.rodar(AGORA, OPC);
    expect(since(t)).toBe('2026-10-10T10:00:00.000Z');
    expect(t.prisma.field_signups.findFirst).toHaveBeenCalledTimes(1);
  });

  it('sem o provedor da chave: igual a desligada', async () => {
    const t = montar([X, Y], undefined);
    await t.svc.rodar(AGORA, OPC);
    expect(since(t)).toBe('2026-10-10T10:00:00.000Z');
    expect(t.prisma.field_signups.findFirst).toHaveBeenCalledTimes(1);
  });
});

// ── Lead que alguém voltou de 5–7 para baixo de 5 (final da revisão, I2b) ──
const LEAD = 'dddddddd-0000-4000-8000-000000000001';
const B = 'bbbbbbbb-0000-4000-8000-000000000002';

/** Mesmo formato do Prisma falso do `signup-sync.service.spec.ts` (que não se edita), mais `lead_events.findMany`. */
function montarComLead(flags: FlagsCrm | undefined, opts: { eventos?: Row[]; consultores?: Row[] } = {}) {
  const consultores: Row[] = opts.consultores ?? [{ id: A, praca_id: PRACA, freela_consultant_id: 'fc-A' }];
  const signups: Row[] = [];
  const leads: Row[] = [{ id: LEAD, praca_id: PRACA, stage: 3, archived: false, is_test: false, phone_key: '987654321', cnpj: null }];
  const eventos: Row[] = [...(opts.eventos ?? [])];
  let seq = 0;
  const prisma: any = {
    field_consultants: { findMany: jest.fn(async () => consultores) },
    field_signup_sync_state: { findUnique: jest.fn(async () => null), upsert: jest.fn(async () => undefined) },
    field_signups: {
      findFirst: jest.fn(async () => null),
      findUnique: jest.fn(async ({ where }: any) => {
        const k = where.consultant_id_freela_user_id;
        return signups.find((s) => s.consultant_id === k.consultant_id && s.freela_user_id === k.freela_user_id) ?? null;
      }),
      create: jest.fn(async ({ data }: any) => void signups.push({ id: `s${++seq}`, ...data })),
      update: jest.fn(async ({ where, data }: any) => Object.assign(signups.find((s) => s.id === where.id)!, data)),
    },
    field_company_signups: { findMany: jest.fn(async () => []), update: jest.fn() },
    leads: {
      findMany: jest.fn(async ({ where }: any) =>
        leads.filter((l) => l.praca_id === where.praca_id && where.OR.some((o: any) => (o.phone_key ? l.phone_key === o.phone_key : false))),
      ),
      findUnique: jest.fn(async ({ where }: any) => leads.find((l) => l.id === where.id) ?? null),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const l = leads.find((x) => x.id === where.id && x.stage < where.stage.lt && x.archived === where.archived && x.is_test === where.is_test);
        if (!l) return { count: 0 };
        Object.assign(l, data);
        return { count: 1 };
      }),
    },
    lead_events: {
      create: jest.fn(async ({ data }: any) => void eventos.push(data)),
      // Eventos de etapa 5..7 de leads que hoje estão abaixo de 5 (o `distinct` por lead).
      findMany: jest.fn(async ({ where }: any) => {
        const ids = eventos
          .filter((e) => e.stage_to != null && e.stage_to >= where.stage_to.gte && e.stage_to <= where.stage_to.lte)
          .filter((e) => (leads.find((l) => l.id === e.lead_id)?.stage ?? 99) < where.lead.stage.lt)
          .map((e) => e.lead_id);
        return [...new Set(ids)].map((lead_id) => ({ lead_id }));
      }),
    },
    $transaction: jest.fn(async (fn: any) => fn(prisma)),
  };
  // O Freela devolve o cadastro ATIVADO (confirmado pela regra `activated`) com o telefone do lead.
  const list = jest.fn(async () => ({
    data: [
      {
        userId: 'u-1',
        contractorId: 'ct-1',
        persona: 'contractor',
        companyName: 'Padaria Bom Pão',
        cnpj: null,
        phone: '+5511987654321',
        email: null,
        source: 'self',
        accessMode: 'setup_link',
        createdAt: '2026-10-18T13:00:00.000Z',
        activatedAt: '2026-10-19T13:00:00.000Z',
        firstVacancyAt: null,
        firstJobCompletedAt: null,
        status: 'activated',
      },
    ],
    nextCursor: null,
  }));
  const freela = { listRegistrations: list } as unknown as FreelaClient;
  const config = { cadastro: async () => ({ confirmation_rule: 'activated' }) } as unknown as RotasConfigService;
  const svc = new SignupSyncService(prisma as PrismaService, freela, config, undefined, flags);
  return { svc, prisma, leads, eventos };
}

const LIGADA: FlagsCrm = { ...CRM_DESLIGADAS, auto_stages: true };
const voltadoDoCinco = [{ lead_id: LEAD, at: new Date('2026-10-12T15:00:00.000Z'), kind: 'stage', stage_to: 5 }];

describe('SignupSyncService: lead que alguém voltou de 5–7 (chave auto_stages)', () => {
  it('ligada: lead em 3 que já passou por 5 não volta a 5; uma consulta só por rodada', async () => {
    const t = montarComLead(LIGADA, {
      eventos: voltadoDoCinco,
      consultores: [
        { id: A, praca_id: PRACA, freela_consultant_id: 'fc-A' },
        { id: B, praca_id: PRACA, freela_consultant_id: 'fc-B' },
      ],
    });
    await t.svc.rodar(AGORA, OPC);
    expect(t.leads[0]).toMatchObject({ stage: 3 });
    expect(t.prisma.leads.updateMany).not.toHaveBeenCalled();
    expect(t.eventos).toHaveLength(1);
    expect(t.prisma.lead_events.findMany).toHaveBeenCalledTimes(1);
    expect(t.prisma.lead_events.findMany.mock.calls[0][0]).toEqual({
      where: { stage_to: { gte: 5, lte: 7 }, lead: { stage: { lt: 5 } } },
      select: { lead_id: true },
      distinct: ['lead_id'],
    });
  });

  it('ligada: lead em 3 cujo único evento de etapa alta é o Perdido (8) sobe a 5, como hoje', async () => {
    const t = montarComLead(LIGADA, { eventos: [{ lead_id: LEAD, at: new Date('2026-10-12T15:00:00.000Z'), kind: 'stage', stage_to: 8 }] });
    await t.svc.rodar(AGORA, OPC);
    expect(t.leads[0]).toMatchObject({ stage: 5, stage_since: '2026-10-20' });
    expect(t.eventos.at(-1)).toMatchObject({ kind: 'stage', stage_to: 5, author_label: 'Freela (sincronização)' });
  });

  it('ligada: lead sem histórico de etapa alta sobe a 5, como hoje', async () => {
    const t = montarComLead(LIGADA);
    await t.svc.rodar(AGORA, OPC);
    expect(t.leads[0]).toMatchObject({ stage: 5 });
  });

  it.each([
    ['desligada', { ...CRM_DESLIGADAS }],
    ['sem o provedor da chave', undefined],
  ])('%s: o lead que já passou por 5 sobe a 5 como hoje, sem consulta a mais', async (_n, flags) => {
    const t = montarComLead(flags, { eventos: voltadoDoCinco });
    await t.svc.rodar(AGORA, OPC);
    expect(t.leads[0]).toMatchObject({ stage: 5 });
    expect(t.prisma.lead_events.findMany).not.toHaveBeenCalled();
  });
});
