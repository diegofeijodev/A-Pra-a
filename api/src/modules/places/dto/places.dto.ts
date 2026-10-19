import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';
import { FONTES_LUGAR, TIPOS_LUGAR } from '../../../domain/places-rules';

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

  @IsString()
  area_id!: string;

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
