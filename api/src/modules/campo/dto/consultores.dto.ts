import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { IsDayString } from '../../../common/validation/is-day.decorator';
import { PIX_TIPOS } from '../../../domain/campo-rules';

const TIPOS_PIX = [...PIX_TIPOS] as string[];

/**
 * Cadastro do representante, bloco B (§21.1): nascimento e área de atuação.
 * Tudo opcional e SEM inicializador — `null` limpa, ausente mantém.
 */
export class AreaFieldsDto {
  @IsOptional()
  @IsDayString()
  birth_date?: string | null;

  @IsOptional()
  @IsLatitude()
  area_lat?: number | null;

  @IsOptional()
  @IsLongitude()
  area_lng?: number | null;

  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0.2)
  @Max(100)
  area_radius_km?: number | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @Length(1, 80, { each: true })
  area_bairros?: string[];
}

export class CreateConsultorDto extends AreaFieldsDto {
  @IsString()
  @Length(2, 120)
  name!: string;

  @IsEmail()
  @MaxLength(160)
  email!: string;

  @IsString()
  @Length(8, 30)
  phone!: string;

  @IsString()
  @Length(11, 14)
  cpf!: string;

  @IsUUID()
  praca_id!: string;

  @IsIn(TIPOS_PIX)
  pix_key_type!: string;

  @IsString()
  @Length(1, 140)
  pix_key!: string;
}

/** Tudo opcional e SEM inicializador: `active` ausente = mantém (CLAUDE.md). */
export class UpdateConsultorDto extends AreaFieldsDto {
  @IsOptional()
  @IsString()
  @Length(2, 120)
  name?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  email?: string;

  @IsOptional()
  @IsString()
  @Length(8, 30)
  phone?: string;

  @IsOptional()
  @IsString()
  @Length(11, 14)
  cpf?: string;

  @IsOptional()
  @IsUUID()
  praca_id?: string;

  @IsOptional()
  @IsIn(TIPOS_PIX)
  pix_key_type?: string;

  @IsOptional()
  @IsString()
  @Length(1, 140)
  pix_key?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class ChannelsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @Length(1, 80, { each: true })
  channels!: string[];
}

export class CnaeItemDto {
  @Matches(/^\d{7}$/, { message: 'code: CNAE com 7 dígitos, sem máscara' })
  code!: string;

  @IsString()
  @Length(1, 120)
  label!: string;
}

export class CnaesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => CnaeItemDto)
  cnaes!: CnaeItemDto[];
}

export class RoutesQueryDto {
  @IsOptional()
  @IsDayString()
  week?: string;

  @IsOptional()
  @IsUUID()
  praca_id?: string;

  @IsOptional()
  @IsUUID()
  consultant_id?: string;
}

export class GenerateRoutesDto {
  @IsDayString()
  week!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  consultant_ids?: string[];
}

export class RouteStopEditDto {
  @IsUUID()
  lead_id!: string;

  @IsOptional()
  @IsBoolean()
  removed?: boolean;
}

export class EditRouteDto {
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => RouteStopEditDto)
  stops!: RouteStopEditDto[];
}

export class VouchersQueryDto {
  @IsOptional()
  @IsIn(['solicitado', 'liberado', 'recusado', 'usado', 'expirado'])
  status?: string;

  @IsOptional()
  @IsUUID()
  praca_id?: string;
}

export class DecideVoucherDto {
  @IsIn(['liberado', 'recusado'])
  decision!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  freela_ref?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class PainelQueryDto {
  @IsOptional()
  @IsDayString()
  from?: string;

  @IsOptional()
  @IsDayString()
  to?: string;

  @IsOptional()
  @IsUUID()
  praca_id?: string;

  @IsOptional()
  @IsUUID()
  consultant_id?: string;
}

export class TrilhasQueryDto {
  @IsOptional()
  @IsDayString()
  day?: string;

  @IsOptional()
  @IsUUID()
  praca_id?: string;
}
