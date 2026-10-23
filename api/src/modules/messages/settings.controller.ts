import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UpdateSettingsDto } from './dto/messages.dto';
import { MessagesService } from './messages.service';
import { Equipe } from '../../common/decorators/admin-only.decorator';

// Configurações de envio: uma linha só no banco (`app_settings`, id 1) — é
// ajuste da operação inteira, não por pessoa nem por praça.
@ApiTags('Configurações de envio')
@ApiBearerAuth()
@Controller('v1/settings')
export class SettingsController {
  constructor(private readonly messages: MessagesService) {}

  @Get()
  get() {
    return this.messages.getSettings();
  }

  @Equipe()
  @Patch()
  update(@Body() dto: UpdateSettingsDto) {
    return this.messages.updateSettings(dto);
  }
}
