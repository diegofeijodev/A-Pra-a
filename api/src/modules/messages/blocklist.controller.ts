import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CreateBlockDto } from './dto/messages.dto';
import { MessagesService } from './messages.service';
import { Equipe } from '../../common/decorators/admin-only.decorator';

@ApiTags('Lista de bloqueio')
@ApiBearerAuth()
@Controller('v1/blocklist')
export class BlocklistController {
  constructor(private readonly messages: MessagesService) {}

  @Get()
  list() {
    return this.messages.listBlocks();
  }

  @Equipe()
  @Post()
  add(@Body() dto: CreateBlockDto) {
    return this.messages.addBlock(dto);
  }

  @Equipe()
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.messages.removeBlock(id);
  }
}
