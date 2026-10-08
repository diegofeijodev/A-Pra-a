import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsISO8601,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

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
