import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { NotificationIdsDto, NotificationsQueryDto } from './dto/notifications.dto';
import { NotificationsService } from './notifications.service';
import { Equipe } from '../../common/decorators/admin-only.decorator';

@ApiTags('Notificações')
@ApiBearerAuth()
@Controller('v1/notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: NotificationsQueryDto) {
    return this.notifications.list(query.praca_id, user);
  }

  @Equipe()
  @Post('dismiss')
  dismiss(@CurrentUser() user: AuthUser, @Body() dto: NotificationIdsDto) {
    return this.notifications.dismiss(dto.ids, user);
  }

  @Equipe()
  @Post('undismiss')
  undismiss(@CurrentUser() user: AuthUser, @Body() dto: NotificationIdsDto) {
    return this.notifications.undismiss(dto.ids, user);
  }
}
