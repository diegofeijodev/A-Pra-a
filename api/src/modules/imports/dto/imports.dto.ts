import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  registerDecorator,
  ValidateIf,
  ValidationOptions,
} from 'class-validator';
import { LEAD_FIELDS } from '../../../domain/catalog';

/** Tetos do corpo da importação — o arquivo já vem lido e parseado pelo web. */
export const MAX_ROWS = 5000;
export const MAX_COLUMNS = 60;
const MAX_CELL = 500;
const MAX_COLUMN_NAME = 200;

const CAMPOS = LEAD_FIELDS.map((f) => f.id);
export const DUP_ACTIONS = ['ignorar', 'completar', 'criar'] as const;
export const PRACA_MODES = ['lote', 'arquivo'] as const;
export const OWNER_MODES = ['lote', 'rodizio'] as const;

const aparado = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

/** Objeto `chave → texto` com teto de tamanho (e, opcionalmente, chaves fechadas). */
function ehMapaDeTexto(
  value: unknown,
  maxKeys: number,
  maxValue: number,
  chaves?: readonly string[],
): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const pares = Object.entries(value as Record<string, unknown>);
  if (pares.length > maxKeys) return false;
  return pares.every(
    ([k, v]) =>
      typeof v === 'string' &&
      v.length <= maxValue &&
      k.length <= MAX_COLUMN_NAME &&
      (!chaves || chaves.includes(k)),
  );
}

/**
 * `map`: campo do lead → coluna do arquivo. As chaves são fechadas nos campos
 * do catálogo (`LEAD_FIELDS`) — mapear para um campo que não existe é erro do
 * cliente, não linha ignorada em silêncio.
 */
function IsFieldMap(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isFieldMap',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate: (value: unknown) => ehMapaDeTexto(value, CAMPOS.length, MAX_COLUMN_NAME, CAMPOS),
        defaultMessage: () =>
          `deve ser um objeto de campos do lead (${CAMPOS.join(', ')}) para colunas do arquivo`,
      },
    });
  };
}

/** `rows`: as linhas do arquivo, cada uma um objeto `coluna → texto`. */
function IsRowArray(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isRowArray',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate: (value: unknown) =>
          Array.isArray(value) &&
          value.length <= MAX_ROWS &&
          value.every((r) => ehMapaDeTexto(r, MAX_COLUMNS, MAX_CELL)),
        defaultMessage: () =>
          `deve ser uma lista de até ${MAX_ROWS} linhas, cada uma um objeto de textos (até ${MAX_COLUMNS} colunas de ${MAX_CELL} caracteres)`,
      },
    });
  };
}

export class EvaluateImportDto {
  @IsArray()
  @ArrayMaxSize(MAX_COLUMNS)
  @IsString({ each: true })
  @MaxLength(MAX_COLUMN_NAME, { each: true })
  columns!: string[];

  @IsRowArray()
  rows!: Record<string, string>[];

  @IsFieldMap()
  map!: Record<string, string>;

  // Texto livre, como em `POST /v1/leads`: a tela sugere `IMPORT_ORIGENS`, mas
  // a planilha pode trazer qualquer canal.
  @aparado()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  origem!: string;

  @IsIn(DUP_ACTIONS as unknown as string[])
  dup_action!: string;

  @IsIn(PRACA_MODES as unknown as string[])
  praca_mode!: string;

  // Obrigatório no modo "lote" (a praça vale para o arquivo inteiro); no modo
  // "arquivo" a praça sai da cidade de cada linha e este campo é ignorado.
  @ValidateIf((o: EvaluateImportDto) => o.praca_mode === 'lote')
  @IsUUID()
  lote_praca_id?: string;

  // Bloco B (§21.3). Só esses CNAEs entram (com ou sem máscara); linha sem CNAE passa.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  @MaxLength(12, { each: true })
  cnaes?: string[];

  // Ausente = `false` (o comportamento de antes): a base de visita costuma vir sem telefone.
  @IsOptional()
  @IsBoolean()
  allow_no_phone?: boolean;
}

export class RunImportDto extends EvaluateImportDto {
  @aparado()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  file_name!: string;

  @IsIn(OWNER_MODES as unknown as string[])
  owner_mode!: string;

  @ValidateIf((o: RunImportDto) => o.owner_mode === 'lote')
  @IsUUID()
  lote_owner_id?: string;

  // Vazio no rodízio = todo mundo ativo, na ordem da tela de pessoas.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID(undefined, { each: true })
  rodizio_ids?: string[];
}

export class SaveMappingDto {
  @aparado()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @IsFieldMap()
  map!: Record<string, string>;
}
