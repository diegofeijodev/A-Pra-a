import { ArrayMaxSize, ArrayMinSize, IsArray, IsString, IsUUID, MaxLength } from 'class-validator';

/** `GET /v1/notifications` — os avisos do sino de UMA praça. */
export class NotificationsQueryDto {
  @IsUUID()
  praca_id!: string;
}

/** `POST /v1/notifications/dismiss` e `.../undismiss` — mesmo corpo pros dois. */
export class NotificationIdsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  ids!: string[];
}
