import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { SITUACOES, STATUS_VOUCHER } from '../../../../domain/voucher-rules';

/*
 * Cupons da 1ª contratação (contrato §38). Campo opcional SEM inicializador: `null` vale como ausente (o web pode reenviar o que
 * leu — lição da S1); o serviço confere o que é obrigatório.
 */

/** Id do contratante no Freela (uuid ou outro id de texto do Freela). */
const ID_FREELA = /^[A-Za-z0-9_-]{1,64}$/;

export class PedirVoucherDto {
  @IsUUID()
  client_id!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  lead_id?: string | null;

  /** Id ou `client_id` da visita (sem sinal, o lugar novo ainda não tem `lead_id` no aparelho). */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  visit_ref?: string | null;

  @IsString()
  @MinLength(1)
  @MaxLength(40)
  segment!: string;

  @IsInt()
  @Min(0)
  @Max(999)
  freelas_per_week!: number;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{2}$/, { message: 'uf: duas letras.' })
  uf?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string | null;
}

export class VouchersQueryDto {
  @IsOptional()
  @IsIn(SITUACOES)
  situacao?: string;

  @IsOptional()
  @IsIn(STATUS_VOUCHER)
  status?: string;

  @IsOptional()
  @IsString()
  praca_id?: string;

  @IsOptional()
  @IsString()
  consultant_id?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'from: data no formato YYYY-MM-DD.' })
  from?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'to: data no formato YYYY-MM-DD.' })
  to?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;
}

export class AprovarVoucherDto {
  @IsUUID()
  client_id!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string | null;

  @IsOptional()
  @IsString()
  @Matches(ID_FREELA, { message: 'contractor_user_id: identificador inválido.' })
  contractor_user_id?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  contractor_name?: string | null;
}

export class ReprovarVoucherDto {
  @IsUUID()
  client_id!: string;

  /** 3–500 quando enviado; obrigatório com `motivo_reprovacao = obrigatorio` (conferido no serviço). */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string | null;
}

export class VincularContratanteDto {
  @IsUUID()
  client_id!: string;

  @IsString()
  @Matches(ID_FREELA, { message: 'contractor_user_id: identificador inválido.' })
  contractor_user_id!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  contractor_name?: string | null;
}

export class DesativarCupomDto {
  @IsUUID()
  client_id!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class CandidatosQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;
}

/** `retry` não tem campos (o corpo `{}` passa; `forbidNonWhitelisted` barra o resto). */
export class VazioVoucherDto {}

/** `PUT …/vouchers/config` (§38.2): chaves opcionais, validadas no domínio (`CONFIG_VOUCHER`). */
export class ConfigVoucherDto {
  @IsOptional() max_por_empresa?: unknown;
  @IsOptional() discount_type?: unknown;
  @IsOptional() percent_off?: unknown;
  @IsOptional() amount_off_cents?: unknown;
  @IsOptional() single_use?: unknown;
  @IsOptional() validade_dias?: unknown;
  @IsOptional() min_job_hours?: unknown;
  @IsOptional() motivo_reprovacao?: unknown;
  @IsOptional() voucher_sync_min?: unknown;
}
