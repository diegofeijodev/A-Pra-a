import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

/** `GET /v1/consultores/map/pins` e `GET /v1/campo/map/pins` (contrato §34.1, §34.4). */
export class PinosQueryDto {
  @IsOptional() @IsUUID() praca_id?: string;
  @IsOptional() @IsIn(['resultado', 'estagio']) mode?: 'resultado' | 'estagio';
  @IsOptional() @IsString() @MaxLength(80) bbox?: string;
  @IsOptional() @IsUUID() cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(2000) limit?: number;
}

export class PinosCampoQueryDto {
  @IsOptional() @IsIn(['resultado', 'estagio']) mode?: 'resultado' | 'estagio';
  @IsOptional() @IsUUID() cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(2000) limit?: number;
}
