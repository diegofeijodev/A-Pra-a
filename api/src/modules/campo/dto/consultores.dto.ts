import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
} from 'class-validator';
import { PIX_TIPOS } from '../../../domain/campo-rules';

const TIPOS_PIX = [...PIX_TIPOS] as string[];

export class CreateConsultorDto {
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
export class UpdateConsultorDto {
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
