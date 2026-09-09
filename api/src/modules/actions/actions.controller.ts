import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ActionsService } from './actions.service';
import {
  CompleteActionDto,
  CreateActionDto,
  CreateCommentDto,
  CreateSubitemDto,
  ListActionsQueryDto,
  PostponeActionDto,
  ReassignActionDto,
  UncompleteActionDto,
  UpdateActionDto,
} from './dto/actions.dto';

@ApiTags('Ações')
@ApiBearerAuth()
@Controller('v1/actions')
export class ActionsController {
  constructor(private readonly actions: ActionsService) {}

  @Get()
  list(@Query() query: ListActionsQueryDto) {
    return this.actions.list(query.praca_id);
  }

  @Post()
  create(@Body() dto: CreateActionDto) {
    return this.actions.create(dto);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.actions.get(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateActionDto) {
    return this.actions.update(id, dto);
  }

  @Post(':id/complete')
  complete(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CompleteActionDto) {
    return this.actions.complete(id, dto, user);
  }

  @Post(':id/uncomplete')
  uncomplete(@Param('id') id: string, @Body() dto: UncompleteActionDto) {
    return this.actions.uncomplete(id, dto);
  }

  @Post(':id/postpone')
  postpone(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: PostponeActionDto) {
    return this.actions.postpone(id, dto, user);
  }

  @Post(':id/reassign')
  reassign(@Param('id') id: string, @Body() dto: ReassignActionDto) {
    return this.actions.reassign(id, dto);
  }

  @Post(':id/comments')
  addComment(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CreateCommentDto) {
    return this.actions.addComment(id, dto, user);
  }

  // Rota estática antes da de ':sid' — a ordem importa (CLAUDE.md).
  @Post(':id/subitems')
  addSubitem(@Param('id') id: string, @Body() dto: CreateSubitemDto) {
    return this.actions.addSubitem(id, dto);
  }

  @Post(':id/subitems/:sid/toggle')
  toggleSubitem(@Param('id') id: string, @Param('sid') sid: string) {
    return this.actions.toggleSubitem(id, sid);
  }
}
