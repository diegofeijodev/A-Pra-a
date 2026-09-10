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

/**
 * Exatamente um entre `template_id` e `text`.
 *
 * Vive num decorator (e não no serviço) porque as duas recusas são de corpo
 * malformado: `400 VALIDATION_ERROR`, do mesmo jeito que etapa fora do funil ou
 * praça que não é UUID. Não pode ser `@IsOptional()` + `@IsUUID()`, porque
 * `@IsOptional()` desliga TODA a validação do campo quando ele vem ausente — e
 * é justamente aí que a regra do par precisa falar.
 */
function IsModeloOuTexto(validationOptions?: ValidationOptions) {
  const temTexto = (o: unknown) => {
    const t = (o as { text?: unknown }).text;
    return typeof t === 'string' && t.trim() !== '';
  };
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isModeloOuTexto',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate: (value: unknown, args) => {
          const outro = temTexto(args?.object ?? {});
          if (value === undefined || value === null || value === '') return outro;
          return !outro && typeof value === 'string' && isUuid(value);
        },
        defaultMessage: (args) => {
          const obj = (args?.object ?? {}) as { template_id?: unknown };
          const modelo = typeof obj.template_id === 'string' && obj.template_id !== '';
          const texto = temTexto(obj);
          if (modelo && texto) return 'mande o modelo (template_id) OU o texto (text), nunca os dois';
          if (!modelo && !texto) return 'mande o modelo (template_id) ou o texto (text)';
          return 'deve ser um UUID';
        },
      },
    });
  };
}

/** O que prévia e criação têm em comum: público, divisão A/B, modo e hora. */
export class DisparoBaseDto {
  @IsObject()
  @ValidateNested()
  @Type(() => DisparoFiltersDto)
  filters!: DisparoFiltersDto;

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

/**
 * Corpo da prévia. Aceita **modelo salvo** (`template_id`) ou **texto escrito
 * na mão** (`text`) — a caixa de campanha do Freela (§18.2) tem os dois modos e
 * precisa contar o mesmo público nos dois. A criação (`POST /v1/disparos`) só
 * aceita modelo: o envio guarda `template_id`, e é dele que sai a trava de 30
 * dias.
 */
export class PreviewDisparoDto extends DisparoBaseDto {
  @IsModeloOuTexto()
  template_id?: string;

  // Variantes separadas por uma linha só com `---`, como no textarea da caixa
  // de campanha do Freela.
  @IsOptional()
  @aparado()
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  text?: string;
}

export class CreateDisparoDto extends DisparoBaseDto {
  @IsUUID()
  template_id!: string;

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
