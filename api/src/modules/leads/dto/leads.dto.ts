import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { IsDayString } from '../../../common/validation/is-day.decorator';
import { CLASSES, CONTACT_KINDS } from '../../../domain/catalog';

const CLASSE_IDS = CLASSES.map((c) => c.id);
const aparado = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
/** Tipos de evento que entram por `POST /events`. `stage` fica de fora: só o `/move` grava etapa. */
export const WIRE_EVENT_KINDS = [...CONTACT_KINDS, 'note'] as string[];

export class NextStepDto {
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  what!: string;

  @IsDayString()
  date!: string;
}

export class ListLeadsQueryDto {
  @IsOptional()
  @IsUUID()
  praca_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @IsOptional()
  @IsUUID()
  owner_id?: string;

  @IsOptional()
  @IsIn(CLASSE_IDS)
  classe?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(8)
  stage?: number;

  // Query string não tem booleano: `Boolean("false")` é `true`, então o valor
  // chega como texto e vira booleano no serviço.
  @IsOptional()
  @IsIn(['true', 'false'])
  archived?: string;

  @IsOptional()
  @IsUUID()
  campanha_id?: string;
}

export class CreateLeadDto {
  @IsOptional()
  @IsUUID()
  praca_id?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(40)
  phone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  cnpj?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  instagram?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  site?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  decisor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  decisor_role?: string;

  @IsIn(CLASSE_IDS)
  classe!: string;

  // Texto livre: a importação (`IMPORT_ORIGENS`), o formulário público e o
  // diálogo de novo lead gravam origens fora da lista curta de `ORIGENS`, que
  // fica no catálogo só como sugestão de tela.
  @aparado()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  origem!: string;

  @IsUUID()
  owner_id!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8)
  stage?: number;

  @IsOptional()
  @IsUUID()
  campanha_id?: string;
}

/**
 * Mesmos campos do POST, todos opcionais — menos `stage`: etapa muda só pelo
 * `/move`, que grava o evento e o `stage_since`.
 */
export class UpdateLeadDto {
  @IsOptional()
  @IsUUID()
  praca_id?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  cnpj?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  instagram?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  site?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  decisor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  decisor_role?: string;

  @IsOptional()
  @IsIn(CLASSE_IDS)
  classe?: string;

  @IsOptional()
  @aparado()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  origem?: string;

  @IsOptional()
  @IsUUID()
  owner_id?: string;

  @IsOptional()
  @IsUUID()
  campanha_id?: string;
}

export class MoveLeadDto {
  @IsInt()
  @Min(1)
  @Max(8)
  stage!: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => NextStepDto)
  next_step?: NextStepDto;

  /**
   * Texto livre (1..120). O catálogo (`LOST_REASONS`) é lista sugerida na tela,
   * não conjunto fechado: a opção "outro" grava o motivo digitado pelo usuário.
   */
  @IsOptional()
  @aparado()
  @IsString()
  @Length(1, 120)
  lost_reason?: string;
}

export class CreateLeadEventDto {
  @IsIn(WIRE_EVENT_KINDS)
  kind!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  text!: string;
}

export class SnoozeLeadDto {
  @IsDayString()
  until!: string;
}

export class CreateLeadVagaDto {
  @IsDayString()
  date!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  funcao!: string;

  @IsBoolean()
  filled!: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(24)
  hours?: number;
}

export class QueueQueryDto {
  // "all" (padrão) ou o uuid de uma pessoa — conferido no serviço, que
  // devolve VALIDATION_ERROR para qualquer outra coisa.
  @IsOptional()
  @IsString()
  @MaxLength(40)
  person?: string;
}

export class LeadsMetricsQueryDto {
  @IsOptional()
  @IsUUID()
  praca_id?: string;
}
