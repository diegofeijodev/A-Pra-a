import { IsOptional, IsUUID } from 'class-validator';
import { IsDayString } from '../../../common/validation/is-day.decorator';

/** Período em dias de Brasília (contrato §27.8). Ausente = semana atual. */
export class SignupsPeriodoDto {
  @IsOptional() @IsDayString() from?: string;
  @IsOptional() @IsDayString() to?: string;
}

export class SignupsEquipeQueryDto extends SignupsPeriodoDto {
  @IsOptional() @IsUUID() praca_id?: string;
  @IsOptional() @IsUUID() consultant_id?: string;
}
