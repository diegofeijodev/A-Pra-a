import type { AuthUser } from '../../../common/auth/auth-user';
import type { PrismaService } from '../../../common/database/prisma.service';
import { VouchersService } from '../vouchers.service';

const ID = '12121212-1212-4212-8212-121212121212';
const ADMIN: AuthUser = { id: '33333333-3333-4333-8333-333333333333', email: 'd@x', name: 'Diego', is_admin: true };
const AGORA = new Date('2026-10-08T15:00:00.000Z');
const LINHA = {
  id: ID,
  code: 'PRC-ABCDEF',
  status: 'solicitado',
  valid_until: '2026-10-10',
  lead_id: 'l',
  lead: { name: 'Bar' },
  consultant_id: 'c',
  consultant: { name: 'Ana' },
  decider: null,
  visit_id: 'v',
  praca_id: 'p',
  freela_ref: null,
  decision_note: null,
  decided_at: null,
  used_at: null,
  created_at: AGORA,
};

function montar(linha: Record<string, unknown> = LINHA) {
  const p = {
    field_vouchers: {
      findUnique: jest.fn().mockResolvedValue(linha),
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  return { p, s: new VouchersService(p as unknown as PrismaService) };
}

describe('VouchersService (§21.7)', () => {
  it('libera com a referência do Freela e quem decidiu', async () => {
    const { p, s } = montar();
    await s.decide(ID, { decision: 'liberado', freela_ref: ' cupom 123 ' }, ADMIN, AGORA);
    expect(p.field_vouchers.updateMany.mock.calls[0]![0]).toMatchObject({
      where: { id: ID, status: 'solicitado' },
      data: { status: 'liberado', freela_ref: 'cupom 123', decided_by: ADMIN.id },
    });
  });

  it('recusar exige o motivo', async () => {
    const { s } = montar();
    await expect(s.decide(ID, { decision: 'recusado' }, ADMIN, AGORA)).rejects.toMatchObject({ response: { code: 'VALIDATION_ERROR' } });
  });

  it('decidir de novo = 409 VOUCHER_STATE; vencido = 409 VOUCHER_EXPIRED', async () => {
    await expect(montar({ ...LINHA, status: 'liberado' }).s.decide(ID, { decision: 'liberado' }, ADMIN, AGORA)).rejects.toMatchObject({
      response: { code: 'VOUCHER_STATE' },
    });
    await expect(montar({ ...LINHA, valid_until: '2026-10-03' }).s.decide(ID, { decision: 'liberado' }, ADMIN, AGORA)).rejects.toMatchObject({
      response: { code: 'VOUCHER_EXPIRED' },
    });
  });

  it('usado só depois de liberado', async () => {
    await expect(montar().s.markUsed(ID, AGORA)).rejects.toMatchObject({ response: { code: 'VOUCHER_STATE' } });
    const { p, s } = montar({ ...LINHA, status: 'liberado' });
    await s.markUsed(ID, AGORA);
    expect(p.field_vouchers.updateMany.mock.calls[0]![0].data).toMatchObject({ status: 'usado', used_at: AGORA });
  });

  it('expira o que venceu antes de hoje', async () => {
    const { p, s } = montar();
    await s.expire(AGORA);
    expect(p.field_vouchers.updateMany.mock.calls[0]![0].where).toEqual({
      status: { in: ['solicitado', 'liberado'] },
      valid_until: { lt: '2026-10-08' },
    });
  });

  it('id malformado = 404', async () => {
    await expect(montar().s.markUsed('x')).rejects.toMatchObject({ response: { code: 'NOT_FOUND' } });
  });
});
