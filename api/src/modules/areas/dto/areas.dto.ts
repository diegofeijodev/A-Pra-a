import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

// Limites finos (Brasil, 200–5000 m) ficam em `domain/area-rules.ts`: o DTO só
// confere tipo e formato; o serviço aplica a regra de negócio.

export class AreasQueryDto {
  // `praca_id` malformado vira 404 no serviço (como nas demais rotas com id na
  // URL), por isso aqui só exigimos string.
  @IsString()
  praca_id!: string;
}

export class CreateAreaDto {
  @IsString()
  praca_id!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @IsNumber()
  lat!: number;

  @IsNumber()
  lng!: number;

  @IsInt()
  radius_m!: number;
}

export class UpdateAreaDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsNumber()
  lat?: number;

  @IsOptional()
  @IsNumber()
  lng?: number;

  @IsOptional()
  @IsInt()
  radius_m?: number;

  // Sem default: ausente = mantém o atual (CLAUDE.md).
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
