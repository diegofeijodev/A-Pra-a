import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { IsDayString } from '../../../../common/validation/is-day.decorator';
import { STATUS_PAGAMENTO } from '../../../../domain/payout-rules';

export class PayoutsQueryDto {
  @IsOptional() @IsDayString() week?: string;
  @IsOptional() @IsUUID() consultant_id?: string;
  @IsOptional() @IsUUID() praca_id?: string;
  @IsOptional() @IsIn(STATUS_PAGAMENTO as unknown as string[]) status?: string;
}

export class ExportQueryDto {
  @IsOptional() @IsDayString() week?: string;
  @IsOptional() @IsUUID() consultant_id?: string;
  @IsOptional() @IsUUID() praca_id?: string;
  @IsOptional() @IsIn(['true', 'false']) include_pix_key?: string;
}

export class GerarDto {
  @IsDayString() week_start!: string;
}

export class MotivoDto {
  @IsString() @MinLength(3) @MaxLength(500) reason!: string;
}

/** `retry` não tem campos (o corpo `{}` passa; `forbidNonWhitelisted` barra o resto). */
export class VazioDto {}

/** Campos de texto do multipart de "pagar" (o arquivo é lido à parte). Conferidos com a mesma regra do ValidationPipe. */
export class PagarDto {
  @IsOptional() @Type(() => Number) @IsInt() paid_cents?: number;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

