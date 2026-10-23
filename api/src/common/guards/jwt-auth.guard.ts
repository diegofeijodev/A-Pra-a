import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { AuthUser } from '../auth/auth-user';
import { PrismaService } from '../database/prisma.service';
import { PERMISSAO_KEY, type Permissao } from '../decorators/admin-only.decorator';
import { LOVABLE_E_FLAGS, type FlagsLovableE } from '../flags/lovable-e.flags';
import { CAMPO_ROUTE_KEY } from '../decorators/campo-route.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { CAMPO_AUDIENCE, CampoAuthGuard } from './campo-auth.guard';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly campo: CampoAuthGuard,
    @Optional() @Inject(LOVABLE_E_FLAGS) private readonly flagsE?: FlagsLovableE,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    // Rotas do consultor de campo têm sessão própria (spec §4.1).
    const isCampo = this.reflector.getAllAndOverride<boolean>(CAMPO_ROUTE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isCampo) return this.campo.canActivate(context);

    const request = context.switchToHttp().getRequest();
    const header: string | undefined = request.headers?.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Token ausente' });
    }

    let payload: { sub: string; email: string; name: string; is_admin: boolean; aud?: string | string[] };
    try {
      payload = await this.jwtService.verifyAsync(token);
    } catch {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Token inválido ou expirado' });
    }

    // Recusa EXPLÍCITA do token de consultor: sem isto ele só falharia porque o
    // `sub` não está em `users` — e a segurança da equipe dependeria disso.
    if (([] as string[]).concat(payload.aud ?? []).includes(CAMPO_AUDIENCE)) {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Token inválido ou expirado' });
    }

    // Confere no banco, não só no token: uma conta pode ser desativada depois
    // de o JWT já ter sido emitido, e o token continuaria "válido" até expirar.
    // `is_gestor` também vem do banco a cada request (lote E §42.2): o token nunca carrega o gestor.
    const user = await this.prisma.users.findUnique({
      where: { id: payload.sub },
      select: { active: true, is_admin: true, is_gestor: true },
    });
    if (!user?.active) {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Conta desativada' });
    }

    // Uma chave só, resolvida no nível mais específico (método antes da classe): `@GestorOuAdmin()` no método vence o
    // `@AdminOnly()` da classe. Sem marca = qualquer pessoa da equipe (só leitura chega aqui sem marca: teste de proteção).
    const permissao = this.reflector.getAllAndOverride<Permissao | undefined>(PERMISSAO_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const gestorLigado = this.flagsE?.team_gestor === true;
    const gestor = gestorLigado && user.is_gestor === true;
    if (permissao === 'admin' && !user.is_admin) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Só administradores podem fazer isso.' });
    }
    if (permissao === 'gestor' && !user.is_admin && !gestor) {
      // Flag desligada: a MESMA resposta de hoje (a rota era só de admin).
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: gestorLigado ? 'Só administradores ou gestores podem fazer isso.' : 'Só administradores podem fazer isso.',
      });
    }

    request.user = {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      is_admin: user.is_admin,
      is_gestor: gestor,
    } satisfies AuthUser;

    return true;
  }
}
