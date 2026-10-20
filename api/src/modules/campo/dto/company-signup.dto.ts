import { Transform, Type } from 'class-transformer';
import { IsEmail, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

/** `''` e só-espaços viram ausente: o formulário do celular manda campo vazio. */
const vazioComoAusente = () =>
  Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() || undefined : value));

export class EnderecoCadastroDto {
  @IsOptional() @vazioComoAusente() @IsString() @MaxLength(9) cep?: string;
  @IsOptional() @vazioComoAusente() @IsString() @MaxLength(200) street?: string;
  @IsOptional() @vazioComoAusente() @IsString() @MaxLength(20) number?: string;
  @IsOptional() @vazioComoAusente() @IsString() @MaxLength(80) complement?: string;
  @IsOptional() @vazioComoAusente() @IsString() @MaxLength(80) neighborhood?: string;
  @IsOptional() @vazioComoAusente() @IsString() @MaxLength(80) city?: string;
  @IsOptional() @vazioComoAusente() @IsString() @Length(2, 2) uf?: string;
}

/** Corpo de `POST /v1/campo/visits/:ref/company-signup` (contrato §26.3). */
export class SignupCreateDto {
  @IsUUID() client_id!: string;
  @IsString() @MinLength(1) @MaxLength(120) @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value)) company_name!: string;
  @IsString() @MinLength(1) @MaxLength(120) @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value)) contact_name!: string;
  @IsString() @Matches(/^[\d\s()+-]{10,20}$/, { message: 'Telefone inválido.' }) phone!: string;
  @IsOptional() @vazioComoAusente() @IsEmail() @MaxLength(120) email?: string;
  @IsOptional() @vazioComoAusente() @Matches(/^[\d./-]{14,18}$/, { message: 'CNPJ inválido.' }) cnpj?: string;
  @IsOptional() @vazioComoAusente() @IsString() @MaxLength(120) corporate_reason?: string;
  @IsOptional() @ValidateNested() @Type(() => EnderecoCadastroDto) address?: EnderecoCadastroDto;
}

export class ReissueLinkDto {
  @IsOptional() @vazioComoAusente() @IsString() @MaxLength(200) reason?: string;
}

/** Query da lista da equipe (§26.4). */
export class SignupsQueryDto {
  @IsOptional() @IsIn(['creating', 'pending', 'activated', 'already_registered', 'failed']) status?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
}
