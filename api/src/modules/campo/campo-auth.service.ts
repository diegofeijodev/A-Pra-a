import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../common/database/prisma.service';
import { CAMPO_AUDIENCE, type CampoTokenPayload } from '../../common/guards/campo-auth.guard';
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
  area_lat: number | null;
  area_lng: number | null;
  area_radius_km: number | null;
  area_bairros: string[];
  praca_route_hours: { start: number; end: number };
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
  praca: { name: string; route_start_hour: number; route_end_hour: number };
  must_change_password: boolean;
  freela_code: string | null;
  area_lat: number | null;
  area_lng: number | null;
  area_radius_km: number | null;
  area_bairros: string[];
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
    area_lat: c.area_lat,
    area_lng: c.area_lng,
    area_radius_km: c.area_radius_km,
    area_bairros: c.area_bairros,
    praca_route_hours: { start: c.praca.route_start_hour, end: c.praca.route_end_hour },
  };
}

@Injectable()
export class CampoAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(email: string, password: string): Promise<CampoLoginView> {
    const c = await this.prisma.field_consultants.findUnique({
      where: { email: email.trim().toLowerCase() },
      include: COM_PRACA,
    });
    if (!c || !(await bcrypt.compare(password, c.password_hash))) {
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
