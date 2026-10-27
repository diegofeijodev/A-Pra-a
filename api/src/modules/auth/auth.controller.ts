import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthUser } from '../../common/auth/auth-user';
import { Equipe } from '../../common/decorators/admin-only.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { AuthService } from './auth.service';
import { ChangeOwnPasswordDto, LoginDto } from './dto/auth.dto';

@ApiTags('Auth')
@ApiBearerAuth()
@Controller('v1/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // Login aberto à internet (contrato §2): 40/min por IP, o dobro do consultor, porque a entrada única do web passa por aqui
  // ANTES do campo — cada login de consultor gasta uma tentativa neste balde e outra no dele (20/min). Nenhum smoke nem o
  // browser-check passa de 6 logins da equipe por minuto.
  @Public()
  @Throttle({ default: { limit: 40, ttl: 60_000 } })
  @HttpCode(200)
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.authService.me(user.id);
  }

  /** A PRÓPRIA senha, pedindo a atual (contrato §2). O id vem do token, nunca do corpo. */
  // Teto próprio: com um token roubado, a senha atual não pode ser adivinhada no balde geral de 300/min.
  @Equipe()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('change-password')
  changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangeOwnPasswordDto) {
    return this.authService.changePassword(user.id, dto);
  }
}
