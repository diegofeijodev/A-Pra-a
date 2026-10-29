import { BadRequestException, NotFoundException, ValidationPipe } from '@nestjs/common';
import type { PrismaService } from '../../../common/database/prisma.service';
import { QueueQueryDto } from '../dto/leads.dto';
import type { LeadsService } from '../leads.service';
import { QueueService } from '../queue.service';

/**
 * `GET /v1/leads/queue?praca_id` (UX final, achado 1): opcional. Ausente = a fila de sempre, com o `where` byte a byte igual ao de
 * antes; presente = UUID (400 no pipe), praça que existe (404) e a fila só dela, sem os leads de teste.
 */
const PRACA = 'aaaaaaaa-0000-4000-8000-000000000001';
const PESSOA = 'bbbbbbbb-0000-4000-8000-000000000001';
// 29/10 12:00 em Brasília.
const AGORA = new Date('2026-10-29T15:00:00.000Z');
const HOJE = '2026-10-29';

type Row = Record<string, any>;

/** O `where` da fila de hoje (antes do `praca_id`), escrito à mão: é o que a rota sem `praca_id` precisa continuar mandando. */
const WHERE_DE_HOJE = {
  archived: false,
  OR: [{ stage: 1 }, { stage: 8, reheat_at: { lte: HOJE } }],
  AND: [{ OR: [{ snooze_until: null }, { snooze_until: { lte: HOJE } }] }],
};

function montar(o: { praca?: boolean; rows?: Row[] } = {}) {
  const prisma: any = {
    app_settings: { findUnique: jest.fn(async () => ({ daily_quota: 20 })) },
    pracas: { findUnique: jest.fn(async () => (o.praca === false ? null : { id: PRACA })) },
    leads: { findMany: jest.fn(async () => o.rows ?? []) },
  };
  const leads = {
    toListView: jest.fn((r: Row) => ({ id: r.id, classe: r.classe, entered_at: r.entered_at })),
  } as unknown as LeadsService;
  return { svc: new QueueService(prisma as PrismaService, leads), prisma };
}
const whereLido = (prisma: any) => prisma.leads.findMany.mock.calls[0][0].where;

beforeEach(() => jest.useFakeTimers({ now: AGORA, doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] }));
afterEach(() => jest.useRealTimers());

describe('QueueService.queue com praca_id (opcional)', () => {
  it('sem praca_id: o where é o de hoje, byte a byte, e a praça nem é lida', async () => {
    const t = montar();
    await t.svc.queue({});
    expect(whereLido(t.prisma)).toStrictEqual(WHERE_DE_HOJE);
    expect(JSON.stringify(whereLido(t.prisma))).toBe(JSON.stringify(WHERE_DE_HOJE));
    expect(t.prisma.pracas.findUnique).not.toHaveBeenCalled();
  });

  it('sem praca_id, com person: o de hoje + owner_id (nada de is_test)', async () => {
    const t = montar();
    await t.svc.queue({ person: PESSOA });
    expect(whereLido(t.prisma)).toStrictEqual({ ...WHERE_DE_HOJE, owner_id: PESSOA });
  });

  it('com praca_id: confere a praça e filtra por ela, sem os leads de teste', async () => {
    const t = montar();
    await t.svc.queue({ praca_id: PRACA });
    expect(t.prisma.pracas.findUnique).toHaveBeenCalledWith({ where: { id: PRACA }, select: { id: true } });
    expect(whereLido(t.prisma)).toStrictEqual({ ...WHERE_DE_HOJE, praca_id: PRACA, is_test: false });
  });

  it('com praca_id e person: os dois filtros', async () => {
    const t = montar();
    await t.svc.queue({ praca_id: PRACA, person: PESSOA });
    expect(whereLido(t.prisma)).toStrictEqual({ ...WHERE_DE_HOJE, owner_id: PESSOA, praca_id: PRACA, is_test: false });
  });

  it('praça que não existe = 404 NOT_FOUND, sem ler os leads', async () => {
    const t = montar({ praca: false });
    await expect(t.svc.queue({ praca_id: PRACA })).rejects.toBeInstanceOf(NotFoundException);
    await expect(t.svc.queue({ praca_id: PRACA })).rejects.toMatchObject({
      response: { code: 'NOT_FOUND', message: 'Praça não encontrada.' },
    });
    expect(t.prisma.leads.findMany).not.toHaveBeenCalled();
  });

  it('praca_id malformado que passe do DTO (chamada direta) = 404 NOT_FOUND, sem tocar no banco', async () => {
    const t = montar();
    await expect(t.svc.queue({ praca_id: 'nao-e-uuid' })).rejects.toBeInstanceOf(NotFoundException);
    expect(t.prisma.pracas.findUnique).not.toHaveBeenCalled();
    expect(t.prisma.leads.findMany).not.toHaveBeenCalled();
  });

  it('o resto da resposta não muda: total, grandes, quota e o corte', async () => {
    const rows = [
      { id: 'l1', stage: 1, classe: 'alvo', entered_at: '2026-10-01', events: [], _count: { events: 0, vagas: 0 } },
      { id: 'l2', stage: 8, classe: 'grande', entered_at: '2026-10-02', events: [], _count: { events: 0, vagas: 0 } },
    ];
    const t = montar({ rows });
    const r = await t.svc.queue({ praca_id: PRACA });
    expect(r).toEqual({
      total: 2,
      grandes: 1,
      quota: 20,
      items: [
        { id: 'l2', classe: 'grande', entered_at: '2026-10-02', is_reheat: true },
        { id: 'l1', classe: 'alvo', entered_at: '2026-10-01', is_reheat: false },
      ],
    });
  });
});

describe('QueueQueryDto.praca_id (pipe global)', () => {
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
  const validar = (q: Row) => pipe.transform(q, { type: 'query', metatype: QueueQueryDto });

  it('ausente ou UUID passa', async () => {
    await expect(validar({})).resolves.toBeInstanceOf(QueueQueryDto);
    await expect(validar({ praca_id: PRACA, person: 'all' })).resolves.toMatchObject({ praca_id: PRACA, person: 'all' });
  });

  it('não-UUID = 400', async () => {
    await expect(validar({ praca_id: 'x' })).rejects.toBeInstanceOf(BadRequestException);
  });
});
