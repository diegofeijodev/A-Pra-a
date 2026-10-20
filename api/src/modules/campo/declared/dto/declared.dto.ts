import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { IsDayString } from '../../../../common/validation/is-day.decorator';
import { MOTIVOS_ANULACAO, STATUS_DECLARACAO } from '../../../../domain/declared-rules';

export const FILTROS_STATUS = [...STATUS_DECLARACAO, 'over_cap'] as const;

export class DeclaredQueryDto {
  @IsOptional() @IsDayString() from?: string;
  @IsOptional() @IsDayString() to?: string;
  @IsOptional() @IsUUID() praca_id?: string;
  @IsOptional() @IsUUID() consultant_id?: string;
  @IsOptional() @IsIn(FILTROS_STATUS as unknown as string[]) status?: string;
}

export class AnularDeclaracaoDto {
  @IsIn(MOTIVOS_ANULACAO as unknown as string[]) reason!: string;
  @IsString() @MinLength(3) @MaxLength(500) note!: string;
  @IsUUID() client_id!: string;
}
