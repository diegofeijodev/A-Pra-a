import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthUser } from '../../common/auth/auth-user';
import { PrismaService } from '../../common/database/prisma.service';
import { isUuid } from '../../common/ids/uuid';
import { AuthService } from '../auth/auth.service';
import { CreateUserDto, SetPasswordDto, UpdateMeDto, UpdateUserDto } from './dto/users.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  list() {
    return this.prisma.users
      .findMany({ orderBy: [{ sort: 'asc' }, { created_at: 'asc' }] })
      .then((users) => users.map((u) => this.auth.toUserView(u)));
  }

  async create(dto: CreateUserDto) {
    const email = dto.email.trim().toLowerCase();
    if (await this.prisma.users.findUnique({ where: { email } })) {
      throw new ConflictException({ code: 'EMAIL_IN_USE', message: 'Já existe uma conta com este e-mail.' });
    }
    const user = await this.prisma.users.create({
      data: {
        email,
        password_hash: await bcrypt.hash(dto.password, 10),
        name: dto.name.trim(),
        role_label: dto.role_label,
        color: dto.color,
        phone: dto.phone,
        is_admin: dto.is_admin,
      },
    });
    return this.auth.toUserView(user);
  }

  async updateMe(userId: string, dto: UpdateMeDto) {
    const user = await this.prisma.users.update({
      where: { id: userId },
      data: {
        name: dto.name,
        color: dto.color,
        phone: dto.phone,
        theme: dto.theme,
        active_praca_id: dto.active_praca_id,
      },
    });
    return this.auth.toUserView(user);
  }

  async updateByAdmin(id: string, dto: UpdateUserDto, currentUserId: string) {
    const target = await this.findOrFail(id);
    if (dto.active === false) await this.assertCanDeactivate(target, currentUserId);

    const user = await this.prisma.users.update({
      where: { id },
      data: {
        name: dto.name,
        role_label: dto.role_label,
        color: dto.color,
        phone: dto.phone,
        is_admin: dto.is_admin,
        active: dto.active,
        sort: dto.sort,
      },
    });
    return this.auth.toUserView(user);
  }

  async setPassword(id: string, dto: SetPasswordDto, currentUser: AuthUser) {
    if (!currentUser.is_admin && currentUser.id !== id) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Só administradores podem trocar a senha de outra pessoa.' });
    }
    await this.findOrFail(id);
    await this.prisma.users.update({ where: { id }, data: { password_hash: await bcrypt.hash(dto.password, 10) } });
    return { ok: true };
  }

  async deactivate(id: string, currentUserId: string) {
    const target = await this.findOrFail(id);
    await this.assertCanDeactivate(target, currentUserId);
    await this.prisma.users.update({ where: { id }, data: { active: false } });
    return { ok: true };
  }

  private async assertCanDeactivate(
    target: { id: string; is_admin: boolean; active: boolean },
    currentUserId: string,
  ) {
    if (target.id === currentUserId) {
      throw new BadRequestException({ code: 'CANNOT_DEACTIVATE_SELF', message: 'Você não pode desativar a própria conta.' });
    }
    if (target.is_admin && target.active) {
      // Conta ainda não foi desativada nesta chamada: se ela é a única admin
      // ativa, a contagem abaixo é 1 e barra a desativação.
      const activeAdmins = await this.prisma.users.count({ where: { is_admin: true, active: true } });
      if (activeAdmins <= 1) {
        throw new BadRequestException({ code: 'LAST_ADMIN', message: 'A última conta administradora ativa não pode ser desativada.' });
      }
    }
  }

  private async findOrFail(id: string) {
    if (!isUuid(id)) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Usuário não encontrado.' });
    const user = await this.prisma.users.findUnique({ where: { id } });
    if (!user) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Usuário não encontrado.' });
    return user;
  }
}
