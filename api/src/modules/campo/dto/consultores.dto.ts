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

  // Lote E §41.3 (endereço e banco, com FIELD_CONSULTANT_PROFILE_ENABLED): validados no serviço, que diz o campo e nunca o valor.
  // Sem inicializador: ausente = mantém; `null` = limpa (com a flag desligada, `null`/ausente é ignorado e valor = 422).
  @IsOptional() @IsString() @MaxLength(160) address_cep?: string | null;
  @IsOptional() @IsString() @MaxLength(160) address_street?: string | null;
  @IsOptional() @IsString() @MaxLength(160) address_number?: string | null;
  @IsOptional() @IsString() @MaxLength(160) address_complement?: string | null;
  @IsOptional() @IsString() @MaxLength(160) address_district?: string | null;
  @IsOptional() @IsString() @MaxLength(160) address_city?: string | null;
  @IsOptional() @IsString() @MaxLength(160) address_state?: string | null;
  @IsOptional() @IsString() @MaxLength(160) bank_name?: string | null;
  @IsOptional() @IsString() @MaxLength(160) bank_branch?: string | null;
  @IsOptional() @IsString() @MaxLength(160) bank_account?: string | null;
  @IsOptional() @IsString() @MaxLength(160) bank_account_type?: string | null;
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

  /** Exceção do fluxo da visita (contrato §31.3); `null` = seguir o padrão. */
  @IsOptional()
  @IsIn(['simples', 'completo'])
  visit_flow?: string | null;

  // Lote E §41.3 (endereço e banco, com FIELD_CONSULTANT_PROFILE_ENABLED): validados no serviço, que diz o campo e nunca o valor.
  // Sem inicializador: ausente = mantém; `null` = limpa (com a flag desligada, `null`/ausente é ignorado e valor = 422).
  @IsOptional() @IsString() @MaxLength(160) address_cep?: string | null;
  @IsOptional() @IsString() @MaxLength(160) address_street?: string | null;
  @IsOptional() @IsString() @MaxLength(160) address_number?: string | null;
  @IsOptional() @IsString() @MaxLength(160) address_complement?: string | null;
  @IsOptional() @IsString() @MaxLength(160) address_district?: string | null;
  @IsOptional() @IsString() @MaxLength(160) address_city?: string | null;
  @IsOptional() @IsString() @MaxLength(160) address_state?: string | null;
  @IsOptional() @IsString() @MaxLength(160) bank_name?: string | null;
  @IsOptional() @IsString() @MaxLength(160) bank_branch?: string | null;
  @IsOptional() @IsString() @MaxLength(160) bank_account?: string | null;
  @IsOptional() @IsString() @MaxLength(160) bank_account_type?: string | null;
}

export class ChannelsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @Length(1, 80, { each: true })
  channels!: string[];
}

/** Lote F2 (contrato §44.7): o conjunto INTEIRO de praças do consultor (a principal fica sempre; 1 a 20, conferido no domínio). */
export class PracasDoConsultorDto {
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  praca_ids!: string[];
}
