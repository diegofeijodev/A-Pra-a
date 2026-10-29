import { Type } from 'class-transformer';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength, ValidateNested } from 'class-validator';
import { IsDayString } from '../../../common/validation/is-day.decorator';
import { NextStepDto } from '../../leads/dto/leads.dto';

export const TAREFAS_FEITAS = ['hot_visit', 'next_step', 'stalled', 'first_vacancy'] as const;
export const CONTATOS_FEITOS = ['call', 'msg_out', 'msg_in', 'visit'] as const;

/** `praca_id` é string de propósito: id malformado ou inexistente vira 404 `NOT_FOUND` no serviço, não 400. */
export class TarefasQueryDto {
  @IsString()
  praca_id!: string;

  @IsOptional()
  @IsIn(['all', 'me'])
  person?: 'all' | 'me';
}

/** Resumo do dia (§47.3): sem `praca_id` = todas as praças; `day` ausente = hoje de Brasília. */
export class ResumoQueryDto {
  @IsOptional()
  @IsUUID()
  praca_id?: string;

  @IsOptional()
  @IsDayString()
  day?: string;
}

export class TarefaFeitaDto {
  @IsUUID()
  lead_id!: string;

  @IsIn(TAREFAS_FEITAS)
  task!: (typeof TAREFAS_FEITAS)[number];

  @IsIn(CONTATOS_FEITOS)
  kind!: (typeof CONTATOS_FEITOS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  text?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => NextStepDto)
  next_step?: NextStepDto;
}
