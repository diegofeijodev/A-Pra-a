import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { AuthUser } from '../auth/auth-user';
import { PrismaService } from '../database/prisma.service';
import { ADMIN_ONLY_KEY } from '../decorators/admin-only.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const header: string | undefined = request.headers?.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Token ausente' });
    }

    let payload: { sub: string; email: string; name: string; is_admin: boolean };
    try {
      payload = await this.jwtService.verifyAsync(token);
    } catch {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Token inválido ou expirado' });
    }

    // Confere no banco, não só no token: uma conta pode ser desativada depois
    // de o JWT já ter sido emitido, e o token continuaria "válido" até expirar.
    const user = await this.prisma.users.findUnique({
      where: { id: payload.sub },
      select: { active: true, is_admin: true },
    });
    if (!user?.active) {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Conta desativada' });
    }

    const isAdminOnly = this.reflector.getAllAndOverride<boolean>(ADMIN_ONLY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isAdminOnly && !user.is_admin) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Só administradores podem fazer isso.' });
    }

    request.user = {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      is_admin: user.is_admin,
    } satisfies AuthUser;

    return true;
  }
}
