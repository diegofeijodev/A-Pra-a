/**
 * `PATCH /v1/users/me` — a praça do "estou nesta praça" (§3).
 *
 * `users.active_praca_id` **não** tem FK (praça apagada anula a coluna à mão),
 * então um uuid bem-formado e inexistente entrava com 200 e estourava depois:
 * `POST /v1/cadences/:id/test` escreve esse id em `leads.praca_id`, que TEM FK,
 * e o `P2003` do Prisma virava **500** — a classe de buraco que o `isUuid()` do
 * CLAUDE.md existe para fechar.
 */
import type { PrismaService } from '../../../common/database/prisma.service';
import type { AuthService } from '../../auth/auth.service';
import { UsersService } from '../users.service';
import type { UpdateMeDto } from '../dto/users.dto';

const DIEGO = '33333333-3333-4333-8333-333333333333';
const PRACA = '11111111-1111-4111-8111-111111111111';

function fakePrisma(praca: unknown = { id: PRACA }) {
  return {
    users: { update: jest.fn().mockResolvedValue({ id: DIEGO }) },
    pracas: { findUnique: jest.fn().mockResolvedValue(praca) },
  };
}

function montar(p: ReturnType<typeof fakePrisma>) {
  const auth = { toUserView: (u: unknown) => u } as unknown as AuthService;
  return new UsersService(p as unknown as PrismaService, auth);
}

const dto = (over: Partial<UpdateMeDto> = {}): UpdateMeDto => ({ ...over }) as UpdateMeDto;

describe('UsersService.updateMe — active_praca_id', () => {
  it('praça que existe entra normalmente', async () => {
    const p = fakePrisma();

    await montar(p).updateMe(DIEGO, dto({ active_praca_id: PRACA }));

    expect(p.pracas.findUnique).toHaveBeenCalledWith({ where: { id: PRACA }, select: { id: true } });
    expect((p.users.update.mock.calls[0]![0] as { data: Record<string, unknown> }).data).toMatchObject({
      active_praca_id: PRACA,
    });
  });

  it('praça inexistente é 404 NOT_FOUND — não 200 agora e 500 depois', async () => {
    const p = fakePrisma(null);

    await expect(montar(p).updateMe(DIEGO, dto({ active_praca_id: PRACA }))).rejects.toMatchObject({
      response: { code: 'NOT_FOUND' },
    });
    expect(p.users.update).not.toHaveBeenCalled();
  });

  it('uuid malformado é 404, não 500 do Prisma', async () => {
    const p = fakePrisma();

    await expect(
      montar(p).updateMe(DIEGO, dto({ active_praca_id: 'nao-e-uuid' })),
    ).rejects.toMatchObject({ response: { code: 'NOT_FOUND' } });
    expect(p.pracas.findUnique).not.toHaveBeenCalled();
  });

  it('`null` sai do contexto da praça sem consultar nada', async () => {
    const p = fakePrisma();

    await montar(p).updateMe(DIEGO, dto({ active_praca_id: null }));

    expect(p.pracas.findUnique).not.toHaveBeenCalled();
    expect((p.users.update.mock.calls[0]![0] as { data: Record<string, unknown> }).data).toMatchObject({
      active_praca_id: null,
    });
  });

  it('corpo sem a praça (só tema, por exemplo) não consulta praça nenhuma', async () => {
    const p = fakePrisma();

    await montar(p).updateMe(DIEGO, dto({ theme: 'light' }));

    expect(p.pracas.findUnique).not.toHaveBeenCalled();
  });
});

describe('Lote E §42.2 — perfil gestor nas pessoas', () => {
  const flags = (on: boolean) => ({ password_policy: false, consultant_profile: false, contact_email: false, team_gestor: on });
  const prismaFake = () => ({
    users: {
      findUnique: jest.fn().mockResolvedValue({ id: '00000000-0000-4000-8000-000000000001', is_admin: false, active: true }),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'n', ...data })),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'n', ...data })),
      count: jest.fn().mockResolvedValue(1),
    },
  });
  const auth = { toUserView: (u: unknown) => u } as never;
  const ID = '00000000-0000-4000-8000-000000000001';
  it('flag desligada: is_gestor null/ausente ignorado; valor = 422 TEAM_GESTOR_DISABLED sem gravar', async () => {
    const p = prismaFake();
    const s = new UsersService(p as never, auth, undefined, flags(false));
    await s.updateByAdmin(ID, { name: 'X', is_gestor: null }, 'admin');
    expect(p.users.update.mock.calls[0][0].data).not.toHaveProperty('is_gestor');
    await expect(s.updateByAdmin(ID, { is_gestor: true }, 'admin')).rejects.toMatchObject({ status: 422, response: { code: 'TEAM_GESTOR_DISABLED' } });
    p.users.findUnique.mockResolvedValue(null);
    await expect(s.create({ email: 'g@x.com', password: 'abcdef', name: 'G', is_gestor: false })).rejects.toMatchObject({ status: 422 });
    expect(p.users.create).not.toHaveBeenCalled();
  });
  it('ligada: o admin marca e desmarca o gestor', async () => {
    const p = prismaFake();
    const s = new UsersService(p as never, auth, undefined, flags(true));
    await s.updateByAdmin(ID, { is_gestor: true, is_admin: false }, 'admin');
    expect(p.users.update.mock.calls[0][0].data).toMatchObject({ is_gestor: true, is_admin: false });
    p.users.findUnique.mockResolvedValue(null);
    await s.create({ email: 'g@x.com', password: 'abcdef', name: 'G', is_gestor: true });
    expect(p.users.create.mock.calls[0][0].data).toMatchObject({ is_gestor: true });
  });
});
