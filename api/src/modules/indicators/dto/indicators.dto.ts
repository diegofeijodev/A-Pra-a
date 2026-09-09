import { IsIn, IsNumber, IsOptional, IsUUID, Max, Min, ValidateIf } from 'class-validator';
import { IsDayString } from '../../../common/validation/is-day.decorator';
import { PERIODS, type PeriodId } from '../../../domain/catalog/indicators';

const PERIOD_IDS = PERIODS.map((p) => p.id);
/** Empresa = todas as praças juntas; praça = uma só (exige `praca_id`). */
export const IND_SCOPES = ['empresa', 'praca'] as const;
export type IndScope = (typeof IND_SCOPES)[number];

/** Período padrão quando a query não manda nenhum (o mesmo do protótipo). */
export const PERIOD_DEFAULT: PeriodId = 'mes';

const umDe = (ids: readonly string[]) => ({ message: `deve ser um de: ${ids.join(', ')}` });

/**
 * Janela de tempo de toda rota de indicador.
 *
 * `from`/`to` só são cobrados em `period=livre` — nos outros a janela sai de
 * "hoje" (Brasília) no servidor. `ValidateIf` (e não `@IsOptional()`) para que a
 * ausência em `livre` vire `400 VALIDATION_ERROR` em vez de virar 30 dias
 * silenciosamente.
 */
export class PeriodQueryDto {
  @IsOptional()
  @IsIn(PERIOD_IDS, umDe(PERIOD_IDS))
  period?: PeriodId;

  @ValidateIf((o: PeriodQueryDto) => o.period === 'livre')
  @IsDayString()
  from?: string;

  @ValidateIf((o: PeriodQueryDto) => o.period === 'livre')
  @IsDayString()
  to?: string;
}

/** `GET /v1/indicators` — as 12 leituras da empresa ou de uma praça. */
export class ReadingsQueryDto extends PeriodQueryDto {
  @IsOptional()
  @IsIn(IND_SCOPES, umDe(IND_SCOPES))
  scope?: IndScope;

  @ValidateIf((o: ReadingsQueryDto) => o.scope === 'praca')
  @IsUUID()
  praca_id?: string;
}

/** `GET /v1/indicators/canais` — a visão canal é sempre de UMA praça. */
export class CanaisQueryDto extends PeriodQueryDto {
  @IsUUID()
  praca_id!: string;
}

/** Teto de um lançamento à mão: cabe contagem de profissionais (60 mil na meta). */
const VALOR_MAX = 1_000_000_000;

/** `POST /v1/indicators/:key/entries` — lançamento à mão de um dia. */
export class IndicatorEntryDto {
  @IsUUID()
  praca_id!: string;

  @IsDayString()
  date!: string;

  @IsNumber()
  @Min(0)
  @Max(VALOR_MAX)
  value!: number;
}

/** `DELETE /v1/indicators/:key/entries` — apaga um lançamento pela chave dele. */
export class EntryKeyQueryDto {
  @IsUUID()
  praca_id!: string;

  @IsDayString()
  date!: string;
}
