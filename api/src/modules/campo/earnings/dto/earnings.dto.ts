import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsObject, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { IsDayString } from '../../../../common/validation/is-day.decorator';

/** Nova versão da regra. O corpo de `config` é conferido por `validarRegra` (domínio): chave desconhecida = 400. */
export class ConfigRemuneracaoDto {
  @IsDayString() valid_from!: string;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
  @IsObject() config!: Record<string, unknown>;
}

export class SimularDto {
  @IsOptional() @IsObject() config?: Record<string, unknown>;
  @Type(() => Number) @IsInt() @Min(0) @Max(1000) signups_confirmed!: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(1000) visits?: number;
  @IsOptional() @IsBoolean() journey_open?: boolean;
}

export class EarningsQueryDto {
  @IsOptional() @IsDayString() week?: string;
  @IsOptional() @IsUUID() praca_id?: string;
  @IsOptional() @IsUUID() consultant_id?: string;
}

export class FecharDto {
  @IsDayString() week_start!: string;
  @IsOptional() @IsUUID() consultant_id?: string;
}

export class ReconciliarDto {
  @IsOptional() @IsUUID() consultant_id?: string;
}

export class AjusteDto {
  @IsUUID() consultant_id!: string;
  @Type(() => Number) @IsInt() @Min(-10_000_000) @Max(10_000_000) amount_cents!: number;
  @IsString() @MinLength(3) @MaxLength(500) reason!: string;
  @IsUUID() client_id!: string;
}

export class EstornoDto {
  @IsString() @MinLength(3) @MaxLength(500) reason!: string;
  @IsUUID() client_id!: string;
}
