import { BadRequestException, Injectable, Optional, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { senhaConfere } from '../../common/auth/senha-falsa';
import { PrismaService } from '../../common/database/prisma.service';
import { CAMPO_AUDIENCE, type CampoTokenPayload } from '../../common/guards/campo-auth.guard';
import { PasswordPolicyService } from '../password-policy/password-policy.service';
import { lerCanais } from './campo-canais';
import { COM_PRACA } from './campo-prisma';
import { signupUrl } from './campo-links';
import type { ChangePasswordDto } from './dto/campo.dto';

/** O consultor visto por ele mesmo — nunca `password_hash`, CPF nem Pix. */
export interface CampoMeView {
  id: string;
  name: string;
  email: string;
  phone: string;
  praca_id: string;
  praca_name: string;
  must_change_password: boolean;
  freela_code: string | null;
  signup_url: string | null;
}

export interface CampoLoginView {
  access_token: string;
  consultant: CampoMeView;
  must_change_password: boolean;
}

export function toMeView(c: {
  id: string;
  name: string;
  email: string;
  phone: string;
  praca_id: string;
  praca: { name: string };
  must_change_password: boolean;
  freela_code: string | null;
}): CampoMeView {
  return {
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone,
    praca_id: c.praca_id,
    praca_name: c.praca.name,
    must_change_password: c.must_change_password,
    freela_code: c.freela_code,
    signup_url: signupUrl(c.freela_code),
  };
}

@Injectable()
export class CampoAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    @Optional() private readonly senhas?: PasswordPolicyService,
  ) {}

  async login(email: string, password: string): Promise<CampoLoginView> {
    const c = await this.prisma.field_consultants.findUnique({
      where: { email: email.trim().toLowerCase() },
      include: COM_PRACA,
    });
    // Sem a conta, compara com o hash fixo: e-mail inexistente e senha errada levam o mesmo tempo (contrato §2 e §20).
    if (!(await senhaConfere(password, c?.password_hash)) || !c) {
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'E-mail ou senha inválidos' });
    }
    if (!c.active) throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Conta desativada' });
    return {
      access_token: await this.issueToken(c),
      consultant: toMeView(c),
      must_change_password: c.must_change_password,
    };
  }

  async changePassword(id: string, dto: ChangePasswordDto): Promise<CampoLoginView> {
    const c = await this.prisma.field_consultants.findUnique({ where: { id } });
    if (!c) throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Conta não encontrada' });
    // 400, não 401: o axios do campo trata 401 como "sessão morreu" e mandaria
    // o consultor para a tela de entrada por ter errado a senha atual.
    if (!(await bcrypt.compare(dto.current_password, c.password_hash))) {
      throw new BadRequestException({ code: 'WRONG_PASSWORD', message: 'A senha atual não confere.' });
    }
    if (dto.new_password === dto.current_password) {
      throw new BadRequestException({ code: 'SAME_PASSWORD', message: 'A senha nova precisa ser diferente da atual.' });
    }
    // Lote E §41.2: a regra vale só para a senha NOVA (nunca a atual nem o login), e só com a flag.
    await this.senhas?.exigir(dto.new_password);
    const atualizado = await this.prisma.field_consultants.update({
      where: { id },
      data: {
        password_hash: await bcrypt.hash(dto.new_password, 10),
        must_change_password: false,
        token_version: { increment: 1 },
      },
      include: COM_PRACA,
    });
    // Token emitido DEPOIS do incremento: o anterior (com a senha provisória) morre.
    return { access_token: await this.issueToken(atualizado), consultant: toMeView(atualizado), must_change_password: false };
  }

  async me(id: string): Promise<{ consultant: CampoMeView; channels: string[] }> {
    const c = await this.prisma.field_consultants.findUnique({ where: { id }, include: COM_PRACA });
    if (!c) throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Conta não encontrada' });
    return { consultant: toMeView(c), channels: await lerCanais(this.prisma) };
  }

  issueToken(c: { id: string; token_version: number }): Promise<string> {
    const payload: CampoTokenPayload = { sub: c.id, tv: c.token_version };
    return this.jwtService.signAsync(payload, {
      audience: CAMPO_AUDIENCE,
      // Mesmo cast do `auth.module.ts`: o tipo do `jsonwebtoken` é template literal.
      expiresIn: (process.env.CAMPO_JWT_EXPIRES_IN || '7d') as `${number}d`,
    });
  }
}
