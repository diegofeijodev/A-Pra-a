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
import { CampoConsultant } from '../auth/campo-consultant';
import { PrismaService } from '../database/prisma.service';
import { ALLOW_PENDING_PASSWORD_KEY } from '../decorators/campo-route.decorator';
import { MULTI_PRACA_LIGADO } from '../flags/multi-praca.flags';
import { pracaAtiva } from '../../domain/multi-praca-rules';

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
 *
 * Lote F2 (contrato §44.4): com `FIELD_MULTI_PRACA_ENABLED`, a MESMA leitura traz a jornada aberta (no máximo uma, índice
 * parcial) e as praças extras; `praca_id` vira a praça ATIVA (a da jornada aberta, se ainda estiver no conjunto; senão a
 * principal) e `praca_principal_id` a principal. Desligada, a leitura e o `request.campo` são os de hoje.
 */
@Injectable()
export class CampoAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    @Optional() @Inject(MULTI_PRACA_LIGADO) private readonly multiPraca: boolean = false,
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

    const multi = this.multiPraca === true;
    const c = (await this.prisma.field_consultants.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        name: true,
        email: true,
        praca_id: true,
        active: true,
        token_version: true,
        must_change_password: true,
        ...(multi
          ? { journeys: { where: { ended_at: null }, take: 1, select: { praca_id: true } }, extra_pracas: { select: { praca_id: true } } }
          : {}),
      },
    })) as LidoDoBanco | null;
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

    const ativa = multi
      ? pracaAtiva({
          principal: c.praca_id,
          extras: (c.extra_pracas ?? []).map((x) => x.praca_id),
          // Sem jornada aberta = `undefined` (a principal); jornada antiga com praça nula = a principal.
          jornadaAberta: c.journeys?.[0] ? c.journeys[0].praca_id : undefined,
        })
      : c.praca_id;
    request.campo = {
      id: c.id,
      name: c.name,
      email: c.email,
      praca_id: ativa,
      must_change_password: c.must_change_password,
      ...(multi ? { praca_principal_id: c.praca_id } : {}),
    } satisfies CampoConsultant;
    return true;
  }
}

interface LidoDoBanco {
  id: string;
  name: string;
  email: string;
  praca_id: string;
  active: boolean;
  token_version: number;
  must_change_password: boolean;
  journeys?: { praca_id: string | null }[];
  extra_pracas?: { praca_id: string }[];
}
