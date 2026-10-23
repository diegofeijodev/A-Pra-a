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
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { IsDayString } from '../../../common/validation/is-day.decorator';
import { CHAVES_MOTIVO_RECUSA } from '../../../domain/catalog/refusal';
import { CARGOS, FREELA_STATUS, HORA_RETORNO_RE, INTERESSES, RESULTADOS_VISITA } from '../../../domain/campo-rules';
import { FLUXOS_VISITA, RESULTADOS_SIMPLES } from '../../../domain/modo-campo-rules';

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

  /**
   * Lote F2 (contrato §44.5): a praça do dia. `null`/ausente = o padrão (roteiro de hoje, senão a principal). Com
   * `FIELD_MULTI_PRACA_ENABLED` desligada, só a principal é aceita (outra = 422 MULTI_PRACA_DISABLED).
   */
  @IsOptional()
  @IsUUID()
  praca_id?: string | null;
}

/** Lote B §37.4: início/fim do intervalo — `client_id` + hora real; a posição é opcional. */
export class IntervaloDto {
  @IsUUID()
  client_id!: string;

  @IsISO8601({ strict: true })
  at!: string;

  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  lng?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(100_000)
  accuracy?: number;
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

  /** Contrato §31.2: dica do fluxo da tela do aparelho (`simples`|`completo`); só vale com a flag ligada. */
  @IsOptional()
  @IsIn([...FLUXOS_VISITA])
  flow?: string;
}

/** Lote B §35.4: marca de uma etapa do checklist (o servidor confere o `id` contra a foto do check-in). */
export class MarcaChecklistDto {
  @IsString()
  @MaxLength(40)
  id!: string;

  @IsOptional()
  @IsBoolean()
  done?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string | null;
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

  /** Contrato §30.1: `conversa` | `fechado`. Sem inicializador (PATCH parcial). */
  @IsOptional()
  @IsIn([...RESULTADOS_VISITA])
  outcome?: string;

  /** Contrato §30.2: slug do catálogo fechado (`domain/catalog/refusal.ts`); `null` limpa. */
  @IsOptional()
  @IsIn(CHAVES_MOTIVO_RECUSA)
  refusal_reason?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  refusal_note?: string | null;

  /** Contrato §30.3: `HH:mm` de Brasília; `null` limpa. */
  @IsOptional()
  @Matches(HORA_RETORNO_RE)
  followup_time?: string | null;

  /** Contrato §30.3: telefone de quem atendeu; normalizado/validado no serviço (a mensagem de erro NÃO repete o número). */
  @IsOptional()
  @IsString()
  @MaxLength(30)
  contact_phone?: string | null;

  /** Lote E §41.4: e-mail de quem atendeu; validado no serviço. `null`/ausente = ignorado; valor com a flag desligada = `422 CONTACT_EMAIL_DISABLED`. */
  @IsOptional()
  @IsString()
  @MaxLength(160)
  contact_email?: string | null;

  /** Contrato §31.5: resultado do fluxo simples; só aceito em visita `simples` (senão `422 FLOW_MODE_MISMATCH`). */
  @IsOptional()
  @IsIn([...RESULTADOS_SIMPLES])
  result?: string | null;

  /** Contrato §31.5: por que a visita foi feita longe do local. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  distance_note?: string | null;

  /** Lote B §35.4: marcas do checklist; `null`/ausente = ignorado; valor com a flag desligada = `422 CHECKLIST_DISABLED`. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => MarcaChecklistDto)
  checklist?: MarcaChecklistDto[] | null;
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
