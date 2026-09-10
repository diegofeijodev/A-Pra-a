import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../../common/auth/auth-user';
import { AdminOnly } from '../../common/decorators/admin-only.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { DisparosService } from './disparos.service';
import { MarkSendDto, ReplySendDto } from './dto/disparos.dto';

// Fila manual: a tela copia o texto, abre a conversa e volta aqui para dizer o
// que aconteceu. Rota separada de `/v1/disparos` porque um envio também pode
// vir de cadência (Task 11) — o envio é a unidade, não o lote.
@ApiTags('Fila de envios')
@ApiBearerAuth()
@Controller('v1/sends')
export class SendsController {
  constructor(private readonly disparos: DisparosService) {}

  // Rota estática antes das de ':id' — a ordem importa (CLAUDE.md). Só admin:
  // é contagem de diagnóstico (resíduo do smoke), não uma tela do produto.
  @Get('count')
  @AdminOnly()
  count() {
    return this.disparos.sendsCount();
  }

  @Post(':id/mark')
  mark(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: MarkSendDto) {
    return this.disparos.mark(id, dto, user);
  }

  @Post(':id/reply')
  reply(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ReplySendDto) {
    return this.disparos.reply(id, dto, user);
  }
}
