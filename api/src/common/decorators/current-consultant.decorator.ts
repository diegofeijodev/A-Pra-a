import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { CampoConsultant } from '../auth/campo-consultant';

export const CurrentConsultant = createParamDecorator((_data: unknown, ctx: ExecutionContext): CampoConsultant => {
  return ctx.switchToHttp().getRequest().campo as CampoConsultant;
});
