import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../common/database/prisma.service';

export interface UserView {
  id: string;
  email: string;
  name: string;
  role_label: string;
  color: string;
  phone: string;
  is_admin: boolean;
  active: boolean;
  theme: string;
  active_praca_id: string | null;
  sort: number;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  // Compartilhado com o UsersModule: uma única projeção de `users` para fora,
  // aqui e no CRUD de pessoas — nunca deixa `password_hash` escapar.
  toUserView(user: {
    id: string;
    email: string;
    name: string;
    role_label: string;
    color: string;
    phone: string;
    is_admin: boolean;
    active: boolean;
    theme: string;
    active_praca_id: string | null;
    sort: number;
  }): UserView {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role_label: user.role_label,
      color: user.color,
      phone: user.phone,
      is_admin: user.is_admin,
      active: user.active,
      theme: user.theme,
      active_praca_id: user.active_praca_id,
      sort: user.sort,
    };
  }

  private issueToken(view: UserView): Promise<string> {
    return this.jwtService.signAsync({
      sub: view.id,
      email: view.email,
      name: view.name,
      is_admin: view.is_admin,
    });
  }

  async login(email: string, password: string) {
    const user = await this.prisma.users.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'E-mail ou senha inválidos' });
    }
    // Senha certa mas conta desativada: não é "credencial inválida" (o
    // e-mail/senha existem e batem), é acesso negado — mesmo código que o
    // `JwtAuthGuard` usa quando a conta é desativada depois do token emitido.
    if (!user.active) {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Conta desativada' });
    }
    const view = this.toUserView(user);
    return { access_token: await this.issueToken(view), user: view };
  }

  async me(userId: string) {
    const user = await this.prisma.users.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Usuário não encontrado' });
    return { user: this.toUserView(user) };
  }
}
