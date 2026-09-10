/**
 * Corpos das rotas `/v1/freela/*` — **snake_case**, como todo o resto do Praça
 * (§1 do contrato). Quem traduz para o camelCase do Freela é o serviço: a
 * tradução mora num lugar só, e a tela do Praça não precisa saber que do outro
 * lado o campo se chama `messagesPerHour`.
 *
 * Os conjuntos fechados (`audience`, `channels`, `schedule_kind`) são os do
 * Freela, em MAIÚSCULO, porque são o valor que sobe: traduzir para rótulo em
 * português aqui só criaria uma tabela a mais para manter dos dois lados.
 */
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayNotEmpty,
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
import { DisparoFiltersDto } from '../../disparos/dto/disparos.dto';

/** Públicos aceitos numa campanha de ativação (uma rodada só). */
export const FREELA_CAMPAIGN_AUDIENCES = [
  'CONTRACTORS_NEVER_PUBLISHED',
  'CONTRACTORS_DORMANT_90D',
  'PROVIDERS_NEVER_APPLIED',
  'PROVIDERS_DORMANT_90D',
  'EXTERNAL_LIST',
] as const;

/** Públicos das campanhas automáticas: os quatro acima + os dois "todos". */
export const FREELA_TEMPLATE_AUDIENCES = [
  'CONTRACTORS_NEVER_PUBLISHED',
  'CONTRACTORS_DORMANT_90D',
  'PROVIDERS_NEVER_APPLIED',
  'PROVIDERS_DORMANT_90D',
  'CONTRACTORS_ALL',
  'CONTRACTORS_ACTIVE',
] as const;

export const FREELA_MODULES = ['bars-restaurants', 'home-services'] as const;
export const FREELA_CHANNELS = ['PUSH', 'WHATSAPP'] as const;
export const FREELA_SCHEDULE_KINDS = ['WEEKLY', 'DATED'] as const;

/** De onde a campanha do Praça saiu — é o que a tela usa para agrupar. */
export const FREELA_CAMPAIGN_KINDS = ['disparo', 'cadencia', 'base', 'manual'] as const;
export type FreelaCampaignKind = (typeof FREELA_CAMPAIGN_KINDS)[number];

const umDe = (lista: readonly string[]) => `deve ser um de: ${lista.join(', ')}`;

/** Recorte por raio: cidade-sede da praça + km. Só nas campanhas de ativação. */
export class FreelaRadiusDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  city!: string;

  @IsInt()
  @Min(1)
  @Max(500)
  km!: number;
}

/** Recorte do público do Freela pela cobertura da praça. */
export class FreelaFiltersDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(200)
  cities?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(27)
  ufs?: string[];

  @IsOptional()
  @IsArray()
  @IsIn(FREELA_MODULES, { each: true, message: umDe(FREELA_MODULES) })
  @ArrayMaxSize(2)
  modules?: string[];

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => FreelaRadiusDto)
  radius?: FreelaRadiusDto;
}

/** As campanhas automáticas não têm raio — só cidades, UFs e módulos. */
export class FreelaTemplateFiltersDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(200)
  cities?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(27)
  ufs?: string[];

  @IsOptional()
  @IsArray()
  @IsIn(FREELA_MODULES, { each: true, message: umDe(FREELA_MODULES) })
  @ArrayMaxSize(2)
  modules?: string[];
}

/** Ritmo anti-bloqueio. Ausente = o ritmo de `GET /v1/settings` convertido. */
export class FreelaPacingDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  messages_per_hour?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  daily_cap?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  window_start_hour?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24)
  window_end_hour?: number;

  @IsOptional()
  @IsBoolean()
  weekdays_only?: boolean;
}

export class AudienceOptionsQueryDto {
  @IsIn(FREELA_CAMPAIGN_AUDIENCES, { message: umDe(FREELA_CAMPAIGN_AUDIENCES) })
  audience!: string;
}

export class AudiencePreviewDto {
  @IsIn(FREELA_CAMPAIGN_AUDIENCES, { message: umDe(FREELA_CAMPAIGN_AUDIENCES) })
  audience!: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => FreelaFiltersDto)
  filters?: FreelaFiltersDto;
}

/** Filtro da lista local (`?praca_id=`). */
export class FreelaListQueryDto {
  @IsOptional()
  @IsUUID()
  praca_id?: string;
}

export class CreateFreelaCampaignDto {
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  name!: string;

  // A campanha é sempre DE uma praça: é assim que a tela filtra e é o contexto
  // que resolve `{{praca}}` no modelo convertido.
  @IsUUID()
  praca_id!: string;

  @IsIn(FREELA_CAMPAIGN_AUDIENCES, { message: umDe(FREELA_CAMPAIGN_AUDIENCES) })
  audience!: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => FreelaFiltersDto)
  filters?: FreelaFiltersDto;

  // Só em `EXTERNAL_LIST`: o público sai do funil do Praça, com o MESMO filtro
  // do disparo (§13) — inclusive lista de bloqueio e trava de 30 dias.
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => DisparoFiltersDto)
  lead_filters?: DisparoFiltersDto;

  @IsOptional()
  @IsUUID()
  template_id?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  whatsapp_template?: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => FreelaPacingDto)
  pacing?: FreelaPacingDto;

  @IsBoolean()
  start_now!: boolean;
}

/** Corpo das campanhas automáticas, sem o vínculo com a praça. */
export class FreelaTemplateBodyDto {
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  name!: string;

  @IsIn(FREELA_SCHEDULE_KINDS, { message: umDe(FREELA_SCHEDULE_KINDS) })
  schedule_kind!: string;

  // 0 = domingo (padrão do JavaScript e do Freela).
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  @ArrayMaxSize(7)
  weekdays?: number[];

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  send_hour?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  target_month?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  target_day?: number;

  @IsOptional()
  @IsInt()
  @Min(2020)
  @Max(2100)
  target_year?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60)
  lead_days?: number;

  @IsIn(FREELA_TEMPLATE_AUDIENCES, { message: umDe(FREELA_TEMPLATE_AUDIENCES) })
  audience!: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => FreelaTemplateFiltersDto)
  filters?: FreelaTemplateFiltersDto;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayMinSize(1)
  @ArrayMaxSize(2)
  @IsIn(FREELA_CHANNELS, { each: true, message: umDe(FREELA_CHANNELS) })
  channels!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  whatsapp_template?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  push_title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  push_body?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  image_key?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  deep_link?: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => FreelaPacingDto)
  pacing?: FreelaPacingDto;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100000)
  max_per_run?: number;
}

export class CreateFreelaTemplateDto extends FreelaTemplateBodyDto {
  @IsUUID()
  praca_id!: string;
}

export class UpdateFreelaTemplateDto extends FreelaTemplateBodyDto {
  // No `PUT` o vínculo é opcional: mandar só o corpo mantém a praça de antes.
  @IsOptional()
  @IsUUID()
  praca_id?: string;
}

export class SetEnabledDto {
  @IsBoolean()
  enabled!: boolean;
}
