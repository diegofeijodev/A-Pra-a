import { Type } from 'class-transformer';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { IsDayString } from '../../../common/validation/is-day.decorator';
import { CELULA_PADRAO_M, CELULAS_M } from '../../../domain/heat-grid';

export const CAMADAS_CALOR = ['visitas', 'passagem', 'cobertura'] as const;
export type CamadaCalor = (typeof CAMADAS_CALOR)[number];

/** Query do mapa de calor (contrato §24.1). Período, bbox e vínculos com a praça são conferidos no serviço. */
export class HeatmapQueryDto {
  @IsUUID() praca_id!: string;
  @IsOptional() @IsIn(CAMADAS_CALOR) layer?: CamadaCalor;
  @IsOptional() @IsDayString() from?: string;
  @IsOptional() @IsDayString() to?: string;
  @IsOptional() @IsUUID() consultant_id?: string;
  @IsOptional() @IsUUID() area_id?: string;
  @IsOptional() @Type(() => Number) @IsIn(CELULAS_M) cell_m?: number = CELULA_PADRAO_M;
  @IsOptional() @IsString() @MaxLength(80) bbox?: string;
}
