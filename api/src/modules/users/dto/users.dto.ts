import {
  IsBoolean,
  IsEmail,
  IsHexColor,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(72)
  password!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  role_label?: string;

  @IsOptional()
  @IsHexColor()
  color?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsBoolean()
  is_admin?: boolean;

  /** Lote E §42.2: perfil gestor; só com `TEAM_GESTOR_ENABLED` (desligada: `null`/ausente ignorado, valor = 422). */
  @IsOptional()
  @IsBoolean()
  is_gestor?: boolean | null;
}

export class UpdateMeDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsHexColor()
  color?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsIn(['dark', 'light'])
  theme?: string;

  // `null` passa direto pelo `@IsOptional()` (que trata null/undefined como
  // "ausente") — é assim que a pessoa sai do contexto de uma praça.
  @IsOptional()
  @IsUUID()
  active_praca_id?: string | null;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  role_label?: string;

  @IsOptional()
  @IsHexColor()
  color?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsBoolean()
  is_admin?: boolean;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsInt()
  sort?: number;

  /** Lote E §42.2 (ver `CreateUserDto.is_gestor`). */
  @IsOptional()
  @IsBoolean()
  is_gestor?: boolean | null;
}

export class SetPasswordDto {
  @IsString()
  @MinLength(6)
  @MaxLength(72)
  password!: string;
}
