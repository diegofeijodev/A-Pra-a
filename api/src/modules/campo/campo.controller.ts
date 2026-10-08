import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CampoConsultant } from '../../common/auth/campo-consultant';
import { AllowPendingPassword, CampoRoute } from '../../common/decorators/campo-route.decorator';
import { CurrentConsultant } from '../../common/decorators/current-consultant.decorator';
import { CampoAuthService } from './campo-auth.service';

/** Rotas do dia a dia do consultor (`/v1/campo/*`) — §20 do contrato. */
@ApiTags('Campo')
@ApiBearerAuth()
@CampoRoute()
@Controller('v1/campo')
export class CampoController {
  constructor(private readonly auth: CampoAuthService) {}

  @AllowPendingPassword()
  @Get('me')
  me(@CurrentConsultant() c: CampoConsultant) {
    return this.auth.me(c.id);
  }
}
