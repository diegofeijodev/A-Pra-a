import { IsOptional, IsUUID } from 'class-validator';
import { IsDayString } from '../../../common/validation/is-day.decorator';

/** `GET /v1/consultores/dashboard` (contrato §33.4). Período (≤ 92 dias) conferido no serviço. */
export class PainelQueryDto {
  @IsOptional() @IsDayString() from?: string;
  @IsOptional() @IsDayString() to?: string;
  @IsOptional() @IsUUID() praca_id?: string;
}

/** `GET /v1/campo/day-summary` (contrato §33.5). */
export class ResumoDiaQueryDto {
  @IsOptional() @IsDayString() day?: string;
}
