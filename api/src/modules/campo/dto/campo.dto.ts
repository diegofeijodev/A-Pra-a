import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsISO8601,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { IsDayString } from '../../../common/validation/is-day.decorator';
import { CARGOS, FREELA_STATUS, INTERESSES } from '../../../domain/campo-rules';

export class CampoLoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(72)
  password!: string;
}

export class ChangePasswordDto {
  @IsString()
  @MinLength(6)
  @MaxLength(72)
  current_password!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  new_password!: string;
}

/**
 * Posição + hora do aparelho. `@Type(() => Number)` porque o check-in chega em
 * multipart (tudo texto) e passa pela mesma classe.
 */
export class PosicaoDto {
  @IsISO8601({ strict: true })
  at!: string;

  @Type(() => Number)
  @IsLatitude()
  lat!: number;

  @Type(() => Number)
  @IsLongitude()
  lng!: number;

  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(100_000)
  accuracy!: number;
}

export class StartJourneyDto extends PosicaoDto {
  @IsUUID()
  client_id!: string;
}

export class PontoDto extends PosicaoDto {
  @IsUUID()
  client_id!: string;
}

export class PontosDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => PontoDto)
  points!: PontoDto[];
}

export class NovoLugarDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(2, 120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string;
}

/** Campos do check-in (multipart). `confirm_new` chega como texto. */
export class CheckinDto extends PosicaoDto {
  @IsUUID()
  client_id!: string;

  @IsOptional()
  @IsUUID()
  lead_id?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => NovoLugarDto)
  new_place?: NovoLugarDto;

  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  confirm_new?: boolean;
}

/** Rascunho do questionário: tudo opcional, `null` limpa, SEM inicializador. */
export class AnswersDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  interlocutor_name?: string | null;

  @IsOptional()
  @IsIn([...CARGOS])
  interlocutor_role?: string | null;

  @IsOptional()
  @IsIn([...FREELA_STATUS])
  freela_status?: string | null;

  @IsOptional()
  @IsIn([...INTERESSES])
  interest?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(500)
  open_vagas?: number | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  vaga_roles?: string[];

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  freelas_per_week?: number | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  channels?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  channel_other?: string | null;

  @IsOptional()
  @IsBoolean()
  needs_followup?: boolean | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  followup_what?: string | null;

  @IsOptional()
  @IsDayString()
  followup_date?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}

export class PlacesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  lng?: number;

  @IsOptional()
  @IsString()
  @Length(2, 80)
  q?: string;
}

export class SimilarQueryDto {
  @IsString()
  @Length(2, 120)
  name!: string;

  @Type(() => Number)
  @IsLatitude()
  lat!: number;

  @Type(() => Number)
  @IsLongitude()
  lng!: number;
}
