import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
    // `is_admin:false` some do target tão silenciosamente quanto `active:false`
    // — as duas formas de "sumir com o último admin" passam pela mesma guarda.
    await this.assertAdminSafeUpdate(target, { active: dto.active, is_admin: dto.is_admin }, currentUserId);

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
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Só administradores podem trocar a senha de outra pessoa.',
      });
    }
    await this.findOrFail(id);
    await this.prisma.users.update({
      where: { id },
      data: { password_hash: await bcrypt.hash(dto.password, 10) },
    });
    return { ok: true };
  }

  async deactivate(id: string, currentUserId: string) {
    const target = await this.findOrFail(id);
    await this.assertAdminSafeUpdate(target, { active: false }, currentUserId);
    await this.prisma.users.update({ where: { id }, data: { active: false } });
    return { ok: true };
  }

  /**
   * Guarda os dois jeitos de "sumir com um admin": desativar (`active:false`)
   * e rebaixar (`is_admin:false`). O invariante é único — uma atualização
   * nunca pode deixar zero admins ativos no sistema — e por isso `LAST_ADMIN`
   * é checado ANTES de `CANNOT_DEACTIVATE_SELF`: o único admin tentando se
   * autodesativar/autorrebaixar precisa ver `LAST_ADMIN` (é esse o caso que a
   * regra existe para barrar), não `CANNOT_DEACTIVATE_SELF`. Um admin que não
   * é o último ainda cai em `CANNOT_DEACTIVATE_SELF` ao tentar se desativar.
   */
  private async assertAdminSafeUpdate(
    target: { id: string; is_admin: boolean; active: boolean },
    patch: { active?: boolean; is_admin?: boolean },
    currentUserId: string,
  ) {
    const willDeactivate = patch.active === false;
    const willDemote = patch.is_admin === false;

    if (target.is_admin && target.active && (willDeactivate || willDemote)) {
      const otherActiveAdmins = await this.prisma.users.count({
        where: { is_admin: true, active: true, id: { not: target.id } },
      });
      if (otherActiveAdmins === 0) {
        throw new BadRequestException({
          code: 'LAST_ADMIN',
          message: 'Não é possível remover o último administrador ativo.',
        });
      }
    }

    if (willDeactivate && target.id === currentUserId) {
      throw new BadRequestException({
        code: 'CANNOT_DEACTIVATE_SELF',
        message: 'Você não pode desativar a própria conta.',
      });
    }
  }

  private async findOrFail(id: string) {
    if (!isUuid(id)) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Usuário não encontrado.' });
    const user = await this.prisma.users.findUnique({ where: { id } });
    if (!user) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Usuário não encontrado.' });
    return user;
  }
}
