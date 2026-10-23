import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../../common/auth/auth-user';
import { GestorOuAdmin } from '../../common/decorators/admin-only.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AreasService } from './areas.service';
import { AreasQueryDto, CreateAreaDto, UpdateAreaDto } from './dto/areas.dto';

/**
 * Áreas de atuação do campo (§21). Leitura: equipe. Escrita: só admin.
 * Sem `@CampoRoute()`: o consultor de campo não acessa.
 */
@ApiTags('Áreas de atuação')
@ApiBearerAuth()
@Controller('v1/areas')
export class AreasController {
  constructor(private readonly areas: AreasService) {}

  @Get()
  list(@Query() q: AreasQueryDto) {
    return this.areas.list(q.praca_id);
  }

  @GestorOuAdmin()
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateAreaDto) {
    return this.areas.create(dto, user);
  }

  @GestorOuAdmin()
  @Patch(':id')
  update(@Param('id') id: string, @Query() q: AreasQueryDto, @Body() dto: UpdateAreaDto) {
    return this.areas.update(id, q.praca_id, dto);
  }
}
