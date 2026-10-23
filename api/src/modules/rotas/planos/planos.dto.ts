import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { IsDayString } from '../../../common/validation/is-day.decorator';
import { KINDS_PLANO, MODELOS_TEMPO, MODOS_PLANO } from '../../../domain/divisao-rotas-rules';

/** Teto de estabelecimentos num plano (os candidatos do §23.4 param em 2.000). */
export const MAX_LEADS_PLANO = 2000;

/** `POST /v1/route-plans` (contrato §39.5). Sem inicializador: ausente = `field_config.divisao`. */
export class CriarPlanoDto {
  @IsUUID() praca_id!: string;
  @IsOptional() @IsUUID() area_id?: string;
  @IsOptional() @IsIn([...KINDS_PLANO]) kind?: string;
  @IsOptional() @IsUUID() parent_lead_id?: string;
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(MAX_LEADS_PLANO) @IsUUID('all', { each: true }) lead_ids?: string[];
  @IsOptional() @IsInt() @Min(1) @Max(100) por_rota?: number;
  @IsOptional() @IsIn([...MODOS_PLANO]) travel_mode?: string;
  @IsOptional() @IsIn([...MODELOS_TEMPO]) modelo_tempo?: string;
}

/** `GET /v1/route-plans/preview` (§39.5): a conta de antes de gerar (UX R1). */
export class PreviaPlanoDto {
  @IsUUID() praca_id!: string;
  @IsOptional() @IsUUID() area_id?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) por_rota?: number;
}

export class PlanosQueryDto {
  @IsUUID() praca_id!: string;
  @IsOptional() @IsIn([...KINDS_PLANO]) kind?: string;
}

/** `POST /v1/route-plans/:id/items/:itemId/assign` (§39.6). */
export class AtribuirItemDto {
  @IsUUID() consultant_id!: string;
  @IsDayString() day!: string;
  @IsOptional() @IsBoolean() confirm_replace?: boolean;
}

/** `PUT /v1/route-plans/config` (§39.2): parcial; `null` = ausente; a faixa é conferida no domínio (`CONFIG_DIVISAO`). */
export class ConfigDivisaoDto {
  @IsOptional() @IsInt() @Min(1) @Max(100) por_rota?: number | null;
  @IsOptional() @IsIn([...MODELOS_TEMPO]) modelo_tempo?: string | null;
  @IsOptional() @IsInt() @Min(1) @Max(120) minutos_por_cliente?: number | null;
  @IsOptional() @IsInt() @Min(0) @Max(240) intervalo_min?: number | null;
  @IsOptional() @IsInt() @Min(60) @Max(1440) limite_min?: number | null;
  @IsOptional() @IsIn([...MODOS_PLANO]) travel_mode?: string | null;
  @IsOptional() @IsInt() @Min(5) @Max(80) kmh_carro?: number | null;
  @IsOptional() @IsInt() @Min(1) @Max(15) kmh_pe?: number | null;
}

/** `GET /v1/campo/routes?from&to` (§39.7). */
export class MinhasRotasQueryDto {
  @IsOptional() @IsDayString() from?: string;
  @IsOptional() @IsDayString() to?: string;
}
