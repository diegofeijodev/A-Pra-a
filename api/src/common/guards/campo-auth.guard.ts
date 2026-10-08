import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { CampoConsultant } from '../auth/campo-consultant';
import { PrismaService } from '../database/prisma.service';
import { ALLOW_PENDING_PASSWORD_KEY } from '../decorators/campo-route.decorator';

export const CAMPO_AUDIENCE = 'campo';

export interface CampoTokenPayload {
  sub: string;
  /** `token_version` na emissão: menor que o do banco = sessão derrubada. */
  tv: number;
}

/**
 * Guard das rotas `/v1/campo/*` (spec §4.1). Não é APP_GUARD: o `JwtAuthGuard`
 * global delega para cá quando a rota tem `@CampoRoute()`.
 *
 * O `audience` vai no `verifyAsync`: o `jsonwebtoken` só confere `aud` quando a
 * opção é passada, e é isso que recusa o token da equipe (que não tem `aud`) por
 * construção. O consultor é relido a cada request — desativar ou mandar nova
 * senha precisa derrubar a sessão na hora, não daqui a 7 dias.
 */
@Injectable()
export class CampoAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const header: string | undefined = request.headers?.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Token ausente' });

    let payload: CampoTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<CampoTokenPayload>(token, { audience: CAMPO_AUDIENCE });
    } catch {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Token inválido ou expirado' });
    }

    const c = await this.prisma.field_consultants.findUnique({
      where: { id: payload.sub },
      select: { id: true, name: true, email: true, praca_id: true, active: true, token_version: true, must_change_password: true },
    });
    if (!c?.active) throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Conta desativada' });
    if (typeof payload.tv !== 'number' || payload.tv < c.token_version) {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Sessão encerrada — entre de novo.' });
    }

    const liberada = this.reflector.getAllAndOverride<boolean>(ALLOW_PENDING_PASSWORD_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (c.must_change_password && !liberada) {
      throw new ForbiddenException({
        code: 'PASSWORD_CHANGE_REQUIRED',
        message: 'Troque a senha provisória antes de continuar.',
      });
    }

    request.campo = {
      id: c.id,
      name: c.name,
      email: c.email,
      praca_id: c.praca_id,
      must_change_password: c.must_change_password,
    } satisfies CampoConsultant;
    return true;
  }
}
