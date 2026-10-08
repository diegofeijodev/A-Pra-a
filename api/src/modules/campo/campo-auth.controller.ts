import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CampoConsultant } from '../../common/auth/campo-consultant';
import { AllowPendingPassword, CampoRoute } from '../../common/decorators/campo-route.decorator';
import { CurrentConsultant } from '../../common/decorators/current-consultant.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CampoAuthService } from './campo-auth.service';
import { CampoLoginDto, ChangePasswordDto } from './dto/campo.dto';

@ApiTags('Campo — sessão')
@ApiBearerAuth()
@CampoRoute()
@Controller('v1/campo/auth')
export class CampoAuthController {
  constructor(private readonly auth: CampoAuthService) {}

  // Login aberto à internet: teto próprio por IP, abaixo dos 300/min globais.
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(200)
  @Post('login')
  login(@Body() dto: CampoLoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  @AllowPendingPassword()
  @HttpCode(200)
  @Post('change-password')
  changePassword(@CurrentConsultant() c: CampoConsultant, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(c.id, dto);
  }
}
