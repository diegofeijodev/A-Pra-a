import { Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { IsDayString } from '../../../common/validation/is-day.decorator';

export class CoberturaDto {
  // A cobertura entra por código do IBGE: UF, cidade, lat/lon e vizinhas saem
  // do `GeoService` (dado estático), nunca do cliente.
  @IsString()
  @Matches(/^\d{7}$/, { message: 'ibge: use o código de 7 dígitos do município.' })
  ibge!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(300)
  km?: number;
}

export class CreatePracaDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  city!: string;

  @IsDayString()
  start_date!: string;

  @IsDayString()
  end_date!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CoberturaDto)
  cobertura?: CoberturaDto;
}

export class UpdatePracaDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @IsDayString()
  start_date?: string;

  @IsOptional()
  @IsDayString()
  end_date?: string;
}

export class StepResultDto {
  // Resultado do portão é número (garçons confirmados, CAC em reais…).
  @IsNumber()
  value!: number;
}

export class StepUnlockDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class AgendaQueryDto {
  @IsOptional()
  @IsDayString()
  from?: string;

  @IsOptional()
  @IsDayString()
  to?: string;

  // "all" (padrão) ou o uuid de uma pessoa — conferido no serviço, que
  // devolve VALIDATION_ERROR para qualquer outra coisa.
  @IsOptional()
  @IsString()
  @MaxLength(40)
  person?: string;
}
