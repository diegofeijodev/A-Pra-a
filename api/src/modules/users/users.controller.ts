import { Body, Controller, Delete, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../../common/auth/auth-user';
import { AdminOnly, Equipe } from '../../common/decorators/admin-only.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateUserDto, SetPasswordDto, UpdateMeDto, UpdateUserDto } from './dto/users.dto';
import { UsersService } from './users.service';

@ApiTags('Pessoas')
@ApiBearerAuth()
@Controller('v1/users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list() {
    return this.users.list();
  }

  @AdminOnly()
  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.users.create(dto);
  }

  // Rota estática ANTES de ':id' — senão ':id' capturaria "me".
  @Equipe()
  @Patch('me')
  updateMe(@CurrentUser() user: AuthUser, @Body() dto: UpdateMeDto) {
    return this.users.updateMe(user.id, dto);
  }

  @AdminOnly()
  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.users.updateByAdmin(id, dto, user.id);
  }

  // Sem @AdminOnly(): admin OU o próprio dono podem trocar — conferido no serviço.
  @Equipe()
  @Put(':id/password')
  setPassword(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SetPasswordDto) {
    return this.users.setPassword(id, dto, user);
  }

  @AdminOnly()
  @Delete(':id')
  deactivate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.users.deactivate(id, user.id);
  }
}
