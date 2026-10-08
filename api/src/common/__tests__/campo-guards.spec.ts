/**
 * Isolamento de sessão (spec §4.1): token de consultor nunca entra na equipe,
 * token da equipe nunca entra no campo — e desativar ou trocar a senha derruba
 * a sessão aberta na hora.
 */
import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { PrismaService } from '../database/prisma.service';
import { AdminOnly } from '../decorators/admin-only.decorator';
import { AllowPendingPassword, CampoRoute } from '../decorators/campo-route.decorator';
import { CAMPO_AUDIENCE, CampoAuthGuard } from '../guards/campo-auth.guard';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';

const SEGREDO = 'segredo-de-teste-com-mais-de-16';
const USER = '33333333-3333-4333-8333-333333333333';
const CONS = '44444444-4444-4444-8444-444444444444';
const PRACA = '00000000-0000-4000-8000-0000000000aa';

class Rotas {
  @CampoRoute() campo() {}
  @CampoRoute() @AllowPendingPassword() campoLiberada() {}
  equipe() {}
  @AdminOnly() equipeAdmin() {}
}

function contexto(nome: keyof Rotas, token?: string) {
  const request: Record<string, unknown> = { headers: token ? { authorization: `Bearer ${token}` } : {} };
  const ctx = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => Rotas.prototype[nome],
    getClass: () => Rotas,
  } as unknown as ExecutionContext;
  return { ctx, request };
}

const CONSULTOR = {
  id: CONS,
  name: 'Ana',
  email: 'ana@exemplo.com',
  praca_id: PRACA,
  active: true,
  token_version: 2,
  must_change_password: false,
};

function fakePrisma(consultor: Record<string, unknown> | null = CONSULTOR) {
  return {
    field_consultants: { findUnique: jest.fn().mockResolvedValue(consultor) },
    users: { findUnique: jest.fn().mockResolvedValue({ active: true, is_admin: true }) },
  };
}

function montar(p: ReturnType<typeof fakePrisma>) {
  const jwt = new JwtService({ secret: SEGREDO });
  const reflector = new Reflector();
  const campo = new CampoAuthGuard(reflector, jwt, p as unknown as PrismaService);
  const equipe = new JwtAuthGuard(reflector, jwt, p as unknown as PrismaService, campo);
  return { jwt, equipe };
}

const tokenEquipe = (jwt: JwtService) =>
  jwt.signAsync({ sub: USER, email: 'diego@praca.local', name: 'Diego', is_admin: true });
const tokenCampo = (jwt: JwtService, tv = 2) => jwt.signAsync({ sub: CONS, tv }, { audience: CAMPO_AUDIENCE });

describe('isolamento de sessão — os dois sentidos', () => {
  it('token de consultor numa rota da equipe → 401, recusado pelo aud (nem consulta users)', async () => {
    const p = fakePrisma();
    const { jwt, equipe } = montar(p);
    const { ctx } = contexto('equipe', await tokenCampo(jwt));

    await expect(equipe.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(p.users.findUnique).not.toHaveBeenCalled();
  });

  it('token de consultor numa rota de admin da equipe → 401 também', async () => {
    const { jwt, equipe } = montar(fakePrisma());
    await expect(equipe.canActivate(contexto('equipeAdmin', await tokenCampo(jwt)).ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('token da equipe numa rota /v1/campo → 401 (sem aud "campo")', async () => {
    const p = fakePrisma();
    const { jwt, equipe } = montar(p);

    await expect(equipe.canActivate(contexto('campo', await tokenEquipe(jwt)).ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(p.field_consultants.findUnique).not.toHaveBeenCalled();
  });

  it('token de consultor numa rota de campo passa e anexa request.campo', async () => {
    const { jwt, equipe } = montar(fakePrisma());
    const { ctx, request } = contexto('campo', await tokenCampo(jwt));

    await expect(equipe.canActivate(ctx)).resolves.toBe(true);
    expect(request.campo).toEqual({
      id: CONS,
      name: 'Ana',
      email: 'ana@exemplo.com',
      praca_id: PRACA,
      must_change_password: false,
    });
    expect(request.user).toBeUndefined();
  });

  it('token da equipe continua passando nas rotas da equipe', async () => {
    const { jwt, equipe } = montar(fakePrisma());
    const { ctx, request } = contexto('equipe', await tokenEquipe(jwt));

    await expect(equipe.canActivate(ctx)).resolves.toBe(true);
    expect((request.user as { id: string }).id).toBe(USER);
  });
});

describe('CampoAuthGuard — sessão derrubada na hora', () => {
  it('sem token → 401', async () => {
    const { equipe } = montar(fakePrisma());
    await expect(equipe.canActivate(contexto('campo').ctx)).rejects.toMatchObject({
      response: { code: 'UNAUTHORIZED', message: 'Token ausente' },
    });
  });

  it('consultor desativado no meio do dia → 401 "Conta desativada"', async () => {
    const { jwt, equipe } = montar(fakePrisma({ ...CONSULTOR, active: false }));
    await expect(equipe.canActivate(contexto('campo', await tokenCampo(jwt)).ctx)).rejects.toMatchObject({
      response: { code: 'UNAUTHORIZED', message: 'Conta desativada' },
    });
  });

  it('token_version antigo (nova senha / desativado e reativado) → 401', async () => {
    const { jwt, equipe } = montar(fakePrisma({ ...CONSULTOR, token_version: 3 }));
    await expect(equipe.canActivate(contexto('campo', await tokenCampo(jwt, 2)).ctx)).rejects.toMatchObject({
      response: { code: 'UNAUTHORIZED', message: 'Sessão encerrada — entre de novo.' },
    });
  });

  it('consultor apagado → 401', async () => {
    const { jwt, equipe } = montar(fakePrisma(null));
    await expect(equipe.canActivate(contexto('campo', await tokenCampo(jwt)).ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('senha provisória pendente → 403 PASSWORD_CHANGE_REQUIRED, menos nas rotas liberadas', async () => {
    const { jwt, equipe } = montar(fakePrisma({ ...CONSULTOR, must_change_password: true }));
    const token = await tokenCampo(jwt);

    const erro = await equipe.canActivate(contexto('campo', token).ctx).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ForbiddenException);
    expect((erro as ForbiddenException).getResponse()).toMatchObject({ code: 'PASSWORD_CHANGE_REQUIRED' });

    await expect(equipe.canActivate(contexto('campoLiberada', token).ctx)).resolves.toBe(true);
  });
});
