import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsISO8601,
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
  registerDecorator,
  type ValidationOptions,
} from 'class-validator';
import { isUuid } from '../../../common/ids/uuid';
import { CLASSES } from '../../../domain/catalog/funnel';
import { SEND_MODES } from '../../../domain/catalog/messages';

const CLASSE_IDS = CLASSES.map((c) => c.id);
const aparado = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const MODE_IDS = SEND_MODES.map((m) => m.id);

/** Status que a fila manual aceita marcar à mão. `falhou` é do motor, não da tela. */
export const MARK_STATUSES = ['enviada', 'entregue'] as const;

/** Filtro de praça/dono: `all` (sem filtro) ou um UUID. */
function IsAllOrUuid(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isAllOrUuid',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate: (value: unknown) => value === 'all' || (typeof value === 'string' && isUuid(value)),
        defaultMessage: () => `deve ser 'all' ou um UUID`,
      },
    });
  };
}

/**
 * Instante ISO 8601 **com fuso** (`Z` ou `±HH:MM`).
 *
 * `datetime-local` do navegador ("2026-09-14T12:00") é proibido de propósito: o
 * processo da API roda em UTC, então `new Date("2026-09-14T12:00")` viraria
 * 09:00 de Brasília e o lote sairia três horas antes do combinado. Quem converte
 * é o web, que sabe o fuso de quem está olhando.
 */
function IsIsoInstant(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isIsoInstant',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate: (value: unknown) =>
          typeof value === 'string' &&
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(value) &&
          !Number.isNaN(new Date(value).getTime()),
        defaultMessage: () => 'deve ser ISO 8601 com fuso, ex.: 2026-09-14T12:00:00Z',
      },
    });
  };
}

/**
 * Filtro do funil que define o público — `Disparos.tsx:14-16,58-69`.
 *
 * Todo campo é opcional e cai no padrão "sem filtro" (`all` / `0`): o corpo
 * `{}` é o público inteiro. Os valores-padrão ficam no próprio objeto, então
 * `filters` chega ao banco sempre com as 6 chaves — é assim que o painel
 * consegue descrever um disparo antigo sem adivinhar o que faltou.
 */
export class DisparoFiltersDto {
  @IsOptional()
  @IsAllOrUuid()
  praca_id: string = 'all';

  // 0 = todas as etapas.
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(8)
  stage: number = 0;

  @IsOptional()
  @IsIn(['all', ...CLASSE_IDS], { message: `deve ser um de: all, ${CLASSE_IDS.join(', ')}` })
  classe: string = 'all';

  // Origem é texto livre no lead (importação e formulário público gravam fora
  // da lista curta do catálogo), então aqui também é texto livre.
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  origem: string = 'all';

  @IsOptional()
  @IsAllOrUuid()
  owner_id: string = 'all';

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3650)
  min_stalled: number = 0;
}

/** Corpo da prévia. O `POST /v1/disparos` herda tudo e acrescenta o nome. */
export class PreviewDisparoDto {
  @IsObject()
  @ValidateNested()
  @Type(() => DisparoFiltersDto)
  filters!: DisparoFiltersDto;

  @IsUUID()
  template_id!: string;

  // Sem variante B no modelo, `true` aqui não divide nada (o servidor decide).
  @IsOptional()
  @IsBoolean()
  split: boolean = false;

  @IsIn(MODE_IDS, { message: `deve ser um de: ${MODE_IDS.join(', ')}` })
  mode!: string;

  // Ausente = agora. Instante ISO com fuso — nunca hora "solta".
  @IsOptional()
  @IsISO8601({ strict: true })
  @IsIsoInstant()
  scheduled_at?: string;
}

export class CreateDisparoDto extends PreviewDisparoDto {
  // Vazio = `"<modelo> · dd/mm/aaaa"`.
  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;
}

export class MarkSendDto {
  @IsIn(MARK_STATUSES, { message: `deve ser um de: ${MARK_STATUSES.join(', ')}` })
  status!: string;
}

export class ReplySendDto {
  // Apara antes de validar: resposta só com espaços não é resposta.
  @aparado()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  text!: string;
}
