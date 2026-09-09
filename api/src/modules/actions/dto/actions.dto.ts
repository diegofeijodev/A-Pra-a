import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { REC_KINDS } from '../../../domain/recurrence';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_MSG = { message: '$property: use uma data no formato YYYY-MM-DD.' };

/** Recorrência no wire — os campos exigidos dependem do `kind` (conferido no serviço). */
export class RecDto {
  @IsIn(REC_KINDS as unknown as string[])
  kind!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3650)
  day?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3650)
  start_day?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3650)
  end_day?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  weekday?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  month_day?: number;
}

export class ListActionsQueryDto {
  @IsUUID()
  praca_id!: string;
}

export class CreateActionDto {
  @IsUUID()
  praca_id!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(300)
  title!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsUUID(undefined, { each: true })
  owners!: string[];

  @Matches(DATE_RE, DATE_MSG)
  due_date!: string;
}

export class UpdateActionDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  title?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsUUID(undefined, { each: true })
  owners?: string[];
}

export class CompleteActionDto {
  // Só vale para ação recorrente: diz QUAL ocorrência foi feita (padrão: hoje).
  @IsOptional()
  @Matches(DATE_RE, DATE_MSG)
  date?: string;

  @IsOptional()
  @IsNumber()
  result?: number;
}

export class UncompleteActionDto {
  @IsOptional()
  @Matches(DATE_RE, DATE_MSG)
  date?: string;
}

export class PostponeActionDto {
  @Matches(DATE_RE, DATE_MSG)
  new_date!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class ReassignActionDto {
  @IsUUID()
  user_id!: string;
}

export class CreateCommentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  text!: string;
}

export class CreateSubitemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  text!: string;
}

export class CreateTemplateActionDto {
  // 0 = ação fixa (fora das etapas); 1..11 = etapas do roteiro.
  @IsInt()
  @Min(0)
  @Max(11)
  step!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(300)
  title!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsUUID(undefined, { each: true })
  owners!: string[];

  @ValidateNested()
  @Type(() => RecDto)
  rec!: RecDto;
}

export class UpdateTemplateActionDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  title?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsUUID(undefined, { each: true })
  owners?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => RecDto)
  rec?: RecDto;
}
