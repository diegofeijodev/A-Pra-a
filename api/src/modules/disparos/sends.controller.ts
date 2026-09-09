import { Body, Controller, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../../common/auth/auth-user';
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

  @Post(':id/mark')
  mark(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: MarkSendDto) {
    return this.disparos.mark(id, dto, user);
  }

  @Post(':id/reply')
  reply(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ReplySendDto) {
    return this.disparos.reply(id, dto, user);
  }
}
