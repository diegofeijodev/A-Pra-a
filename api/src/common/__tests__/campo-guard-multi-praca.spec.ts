/**
 * Lote F2 (contrato §44.4): a praça ATIVA do request. Com a flag ligada o guard lê, na MESMA consulta do consultor, a jornada
 * aberta e as praças extras; desligada, a leitura e o `request.campo` são os de hoje (byte a byte).
 */
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { PrismaService } from '../database/prisma.service';
import { CampoRoute } from '../decorators/campo-route.decorator';
import { CAMPO_AUDIENCE, CampoAuthGuard } from '../guards/campo-auth.guard';

const SEGREDO = 'segredo-de-teste-com-mais-de-16';
const CONS = '44444444-4444-4444-8444-444444444444';
const A = '00000000-0000-4000-8000-0000000000aa';
const B = '00000000-0000-4000-8000-0000000000bb';

class Rotas {
  @CampoRoute() campo() {}
}

function contexto(token: string) {
  const request: Record<string, unknown> = { headers: { authorization: `Bearer ${token}` } };
  const ctx = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => Rotas.prototype.campo,
    getClass: () => Rotas,
  } as unknown as ExecutionContext;
  return { ctx, request };
}

const BASE = { id: CONS, name: 'Ana', email: 'ana@exemplo.com', praca_id: A, active: true, token_version: 2, must_change_password: false };

async function rodar(lido: Record<string, unknown>, ligado: boolean) {
  const findUnique = jest.fn().mockResolvedValue(lido);
  const p = { field_consultants: { findUnique } } as unknown as PrismaService;
  const jwt = new JwtService({ secret: SEGREDO });
  const guard = ligado ? new CampoAuthGuard(new Reflector(), jwt, p, true) : new CampoAuthGuard(new Reflector(), jwt, p);
  const { ctx, request } = contexto(await jwt.signAsync({ sub: CONS, tv: 2 }, { audience: CAMPO_AUDIENCE }));
  await expect(guard.canActivate(ctx)).resolves.toBe(true);
  return { campo: request.campo as Record<string, unknown>, args: findUnique.mock.calls[0][0] as { select: Record<string, unknown> } };
}

describe('CampoAuthGuard — praça ativa (§44.4)', () => {
  it('desligada: a mesma leitura de hoje (sem jornada nem junção) e o mesmo request.campo, mesmo com a junção preenchida', async () => {
    const { campo, args } = await rodar({ ...BASE, journeys: [{ praca_id: B }], extra_pracas: [{ praca_id: B }] }, false);
    expect(Object.keys(args.select).sort()).toEqual(['active', 'email', 'id', 'must_change_password', 'name', 'praca_id', 'token_version']);
    expect(campo).toStrictEqual({ id: CONS, name: 'Ana', email: 'ana@exemplo.com', praca_id: A, must_change_password: false });
  });

  it('ligada: a jornada aberta e as extras vêm na MESMA consulta', async () => {
    const { args } = await rodar({ ...BASE, journeys: [], extra_pracas: [] }, true);
    expect(args.select.journeys).toEqual({ where: { ended_at: null }, take: 1, select: { praca_id: true } });
    expect(args.select.extra_pracas).toEqual({ select: { praca_id: true } });
  });

  it('ligada, sem jornada aberta: a principal (e a principal anotada)', async () => {
    const { campo } = await rodar({ ...BASE, journeys: [], extra_pracas: [{ praca_id: B }] }, true);
    expect(campo).toMatchObject({ praca_id: A, praca_principal_id: A });
  });

  it('ligada, jornada aberta em B (no conjunto): B', async () => {
    const { campo } = await rodar({ ...BASE, journeys: [{ praca_id: B }], extra_pracas: [{ praca_id: B }] }, true);
    expect(campo).toMatchObject({ praca_id: B, praca_principal_id: A });
  });

  it('ligada, jornada aberta em B mas B saiu do conjunto: a principal (o acesso cai na hora)', async () => {
    const { campo } = await rodar({ ...BASE, journeys: [{ praca_id: B }], extra_pracas: [] }, true);
    expect(campo).toMatchObject({ praca_id: A, praca_principal_id: A });
  });

  it('ligada, jornada aberta de antes da flag (praça nula): a principal', async () => {
    const { campo } = await rodar({ ...BASE, journeys: [{ praca_id: null }], extra_pracas: [{ praca_id: B }] }, true);
    expect(campo).toMatchObject({ praca_id: A });
  });
});
