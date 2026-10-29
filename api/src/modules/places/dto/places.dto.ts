import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min, ValidateIf } from 'class-validator';
import { FONTES_LUGAR, TIPOS_LUGAR } from '../../../domain/places-rules';

/**
 * Segmentos editáveis (contrato §36): com `FIELD_SEGMENTS_ENABLED` os tipos válidos são os segmentos ATIVOS (até 10), conferidos
 * no serviço. Desligada, valem os decorators de hoje, com a MESMA mensagem (o `ValidateIf` não acrescenta mensagem nenhuma). Lê o
 * ambiente na hora da validação (o boot já validou as variáveis), como o `FreelaClient`.
 */
export const segmentosLigados = (): boolean => (process.env.FIELD_SEGMENTS_ENABLED ?? '').trim() === 'true';

/** Lote D (§40.3): `kind` ausente (ou nulo, ou `lugares`) = a busca de hoje — os decorators de hoje valem como hoje. */
export const KINDS_BUSCA = ['lugares', 'shoppings', 'lojas'] as const;
const ehLugares = (o: { kind?: string | null }) => o.kind == null || o.kind === 'lugares';

/** Tetos do corpo de "adicionar como leads". */
export const MAX_IDS_POR_CHAMADA = 300;

export class PlaceSearchQueryDto {
  // `praca_id` malformado vira 404 no serviço, como nas demais rotas.
  @IsString()
  praca_id!: string;
}

export class StartPlaceSearchDto {
  @IsString()
  praca_id!: string;

  // Shoppings: opcional (sem ela, o centro da praça); lojas: não usa. `lugares`: obrigatória, como hoje.
  @ValidateIf((o: StartPlaceSearchDto) => ehLugares(o) || o.area_id != null)
  @IsString()
  area_id!: string;

  @ValidateIf((o: StartPlaceSearchDto) => !segmentosLigados() && ehLugares(o))
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(TIPOS_LUGAR.length)
  @ArrayUnique()
  @IsIn(TIPOS_LUGAR, { each: true })
  types!: string[];

  // Sem default: ausente = 'osm' (aplicado no serviço).
  @IsOptional()
  @IsIn(FONTES_LUGAR)
  source?: string;

  @IsOptional()
  @IsBoolean()
  refresh?: boolean;

  // Lote D (§40.3). Sem default: ausente = `lugares`. Com a flag dos shoppings desligada, `kind` ≠ `lugares` = 404 no serviço.
  @IsOptional()
  @IsIn(KINDS_BUSCA)
  kind?: string | null;

  /** `shoppings`: raio em volta do centro, até 30 km (padrão 15 km). `lugares`: raio em volta do centro da área, até 15 km (padrão = o da área; o serviço barra acima). */
  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(30000)
  radius_m?: number | null;

  /** Só em `lojas`: o shopping (lead com `place_kind = 'shopping'`) da praça. */
  @IsOptional()
  @IsString()
  parent_lead_id?: string | null;
}

export class AddPlaceLeadsDto {
  @IsString()
  praca_id!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_IDS_POR_CHAMADA)
  @ArrayUnique()
  @IsString({ each: true })
  candidate_ids!: string[];

  @IsOptional()
  @IsString()
  owner_id?: string;
}

/** `PUT /v1/place-searches/segments` (§36.6): a lista inteira; cada segmento é validado no domínio (`validarSegmentos`). */
export class PutSegmentsDto {
  @IsArray()
  segments!: unknown[];
}
