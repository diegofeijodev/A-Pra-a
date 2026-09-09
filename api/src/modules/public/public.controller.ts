import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { PublicLeadsThrottle } from '../../common/decorators/public-leads-throttle.decorator';
import { CreatePublicLeadDto } from './dto/public.dto';
import { PublicService } from './public.service';

// Sem token — formulário embutido em anúncio/landing, aberto ao mundo.
// Throttle mais apertado que o global (300/min) no POST: é o único ponto da
// API que qualquer visitante da internet consegue escrever sem login. O 10 do
// `@Throttle` é o padrão de produção; `PUBLIC_LEADS_PER_MINUTE` afrouxa em
// desenvolvimento (o `AppThrottlerGuard` troca o limite no request).
@ApiTags('Formulário público')
@Public()
@Controller('v1/public')
export class PublicController {
  constructor(private readonly service: PublicService) {}

  @Get('pracas/:id')
  praca(@Param('id') id: string) {
    return this.service.praca(id);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @PublicLeadsThrottle()
  @Post('leads')
  createLead(@Body() dto: CreatePublicLeadDto) {
    return this.service.createLead(dto);
  }
}
