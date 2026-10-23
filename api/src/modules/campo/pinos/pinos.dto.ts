import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';

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

/** `GET /v1/consultores/map/list` — Clientes > Lista (contrato §34.6). */
export class PinosListaQueryDto {
  @IsOptional() @IsUUID() praca_id?: string;
  /** Códigos da legenda separados por vírgula; conferidos no serviço. */
  @IsOptional() @IsString() @MaxLength(200) codes?: string;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(80) q?: string;
  @IsOptional() @IsUUID() cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) limit?: number;
}
