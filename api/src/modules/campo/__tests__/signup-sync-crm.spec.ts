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
