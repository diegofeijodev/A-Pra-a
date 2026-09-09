import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { COND_ACTIONS, COND_RULES, ENTRY_RULES, EXIT_REASON_LABEL } from '../../../domain/catalog/cadences';
import { AUDIENCES, CHANNELS } from '../../../domain/catalog/messages';

const aparado = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

const AUDIENCE_IDS = AUDIENCES.map((a) => a.id);
const CHANNEL_IDS = CHANNELS.map((c) => c.id);
const ENTRY_IDS = ENTRY_RULES.map((e) => e.id);
const RULE_IDS = COND_RULES.map((r) => r.id);
const ACTION_IDS = COND_ACTIONS.map((a) => a.id);
/** Ação de saída da cadência: tudo, menos "segue na cadência" — o fim é fim. */
const EXIT_ACTION_IDS = ACTION_IDS.filter((id) => id !== 'continua');
const EXIT_REASON_IDS = Object.keys(EXIT_REASON_LABEL);

/** Tipos de nó — `msg` e `task` são passos, `cond` é bifurcação. */
export const NODE_KINDS = ['msg', 'task', 'cond'] as const;

/** Teto de nós por cadência: a tela do protótipo monta trilhas de 3 a 8 nós. */
const MAX_NODES = 40;

export class CadenceExitDto {
  @IsIn(EXIT_ACTION_IDS, { message: `deve ser um de: ${EXIT_ACTION_IDS.join(', ')}` })
  action!: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  note: string = '';
}

/**
 * Um nó da trilha. `id` é opcional e só faz sentido no `PUT`: nó que volta com
 * o id que já tinha é ATUALIZADO no lugar, preservando o log das inscrições
 * (`enrollment_logs.node_id`) — sem isso, salvar a cadência jogaria todo mundo
 * que estava dentro de volta para o primeiro passo.
 */
export class CadenceNodeDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsIn(NODE_KINDS, { message: `deve ser um de: ${NODE_KINDS.join(', ')}` })
  kind!: string;

  // Dia da trilha contado da entrada. `cond` não tem dia (roda junto do passo).
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  day: number = 0;

  @IsOptional()
  @IsIn(CHANNEL_IDS, { message: `deve ser um de: ${CHANNEL_IDS.join(', ')}` })
  channel?: string;

  @IsOptional()
  @IsUUID()
  template_id?: string;

  // Mensagem própria (sem modelo). Aparada: texto só com espaço não é texto.
  @IsOptional()
  @aparado()
  @IsString()
  @MaxLength(2000)
  text?: string;

  @IsOptional()
  @aparado()
  @IsString()
  @MaxLength(300)
  task?: string;

  @IsOptional()
  @IsIn(RULE_IDS, { message: `deve ser um de: ${RULE_IDS.join(', ')}` })
  rule?: string;

  @IsOptional()
  @IsIn(ACTION_IDS, { message: `deve ser um de: ${ACTION_IDS.join(', ')}` })
  action?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  note?: string;
}

/** Corpo do `POST` e do `PUT` — a cadência inteira, nós inclusive. */
export class CadenceBodyDto {
  @aparado()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string;

  @IsIn(AUDIENCE_IDS, { message: `deve ser um de: ${AUDIENCE_IDS.join(', ')}` })
  audience!: string;

  @IsIn(ENTRY_IDS, { message: `deve ser um de: ${ENTRY_IDS.join(', ')}` })
  entry!: string;

  @IsObject()
  @ValidateNested()
  @Type(() => CadenceExitDto)
  exit!: CadenceExitDto;

  @IsOptional()
  @IsBoolean()
  paused: boolean = false;

  @IsArray()
  @ArrayMaxSize(MAX_NODES)
  @ValidateNested({ each: true })
  @Type(() => CadenceNodeDto)
  nodes!: CadenceNodeDto[];
}

export class EnrollLeadDto {
  @IsUUID()
  lead_id!: string;
}

export class TestCadenceDto {
  // Telefone do "Testar comigo": vai receber a trilha comprimida de verdade.
  @aparado()
  @IsString()
  @MinLength(8)
  @MaxLength(30)
  phone!: string;
}

export class ExitEnrollmentDto {
  // Ausente = `manual` (foi a tela que tirou a pessoa da cadência).
  @IsOptional()
  @IsIn(EXIT_REASON_IDS, { message: `deve ser um de: ${EXIT_REASON_IDS.join(', ')}` })
  reason?: string;
}

export class EnrollmentsQueryDto {
  @IsOptional()
  @IsUUID()
  cadence_id?: string;
}
