import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { IsDayString } from '../../../common/validation/is-day.decorator';
import {
  CAMPANHA_STATUS,
  CREATIVE_STATUS,
  DESTINOS,
  FORMATOS,
  IA_TOOLS,
  OBJETIVOS,
  PROOF_KIND_LABEL,
} from '../../../domain/catalog/midia';

const aparado = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

/**
 * Campo que pode ser OMITIDO mas **não** pode vir `null`.
 *
 * `@IsOptional()` pula a validação em `undefined` E em `null` — o `null` passaria
 * batido até o Prisma (coluna `NOT NULL` ⇒ 500) ou até um `.trim()` de `null`.
 * Neste módulo a regra é: `@IsOptional()` só em campo que o banco aceita nulo
 * (`owner_id`, `publish_at`, `ia`) e em filtro de query (onde `null` não existe);
 * todo o resto usa `@Opcional()`, que valida o valor sempre que ele vem —
 * inclusive `null`, virando 400 em vez de 500.
 */
const Opcional = () => ValidateIf((_o, value) => value !== undefined);

const OBJETIVO_IDS = OBJETIVOS.map((o) => o.id);
const DESTINO_IDS = DESTINOS.map((d) => d.id);
const FORMATO_IDS = FORMATOS.map((f) => f.id);
const CREATIVE_STATUS_IDS = CREATIVE_STATUS.map((s) => s.id);
const PROOF_KINDS = Object.keys(PROOF_KIND_LABEL);

/** Público da campanha — o mesmo par do funil e das mensagens. */
export const PUBLICOS = ['contratante', 'freelancer'] as const;
/** Plataformas de tráfego do protótipo (`CampTrafego.tsx`). */
export const PLATAFORMAS = ['meta', 'google'] as const;
/** Tipos de comentário do criativo (`store.tsx:867-880`). */
export const COMMENT_KINDS = ['nota', 'ajuste', 'aprovacao'] as const;
/** Revisão do criativo: aprovar ou pedir ajuste. */
export const REVIEW_KINDS = ['aprovacao', 'ajuste'] as const;

/** Teto de texto livre do briefing (`MAXTEXT` de `CampEstrategia.tsx`). */
const MAXTEXT = 400;
/** Teto de provas amarradas a uma campanha — a praça tem 13 no seed. */
const MAX_PROVAS = 30;
/** Teto de criativos numa entrada de tráfego. */
const MAX_CRIATIVOS = 30;
/** Justificativa do portão: 10 caracteres é o mínimo do protótipo. */
const JUST_MIN = 10;

const umDe = (ids: readonly string[]) => ({ message: `deve ser um de: ${ids.join(', ')}` });

/** Query de rota que trabalha por praça (provas e freio de preenchimento). */
export class PracaQueryDto {
  @IsUUID()
  praca_id!: string;
}

// ── provas ─────────────────────────────────────────────────────

export class ProofBodyDto {
  @IsUUID()
  praca_id!: string;

  @IsIn(PROOF_KINDS, umDe(PROOF_KINDS))
  kind!: string;

  @aparado()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;
}

// ── campanhas ──────────────────────────────────────────────────
export class CampanhasQueryDto {
  @IsOptional()
  @IsUUID()
  praca_id?: string;
}

/**
 * Corpo do `POST` e do `PUT` da campanha.
 *
 * `name` NÃO entra: quem monta é o servidor (`campanhaName`), para o nome do
 * Meta e o do Google nunca divergirem do que a praça/público/objetivo dizem.
 * `justification` só é lida quando a campanha sai do rascunho com o portão
 * fechado e ainda não tem justificativa gravada.
 */
export class CampanhaBodyDto {
  @IsUUID()
  praca_id!: string;

  @IsIn(PUBLICOS, umDe(PUBLICOS))
  publico!: string;

  @IsIn(OBJETIVO_IDS, umDe(OBJETIVO_IDS))
  objetivo!: string;

  @IsDayString()
  start!: string;

  @IsDayString()
  end!: string;

  @IsNumber()
  @Min(0)
  @Max(10_000_000)
  verba!: number;

  @IsNumber()
  @Min(0)
  @Max(10_000_000)
  gasto!: number;

  // A dor e a mensagem-chave são o briefing: sem elas a campanha não salva
  // (`CampEstrategia.tsx:159`).
  @aparado()
  @IsString()
  @MinLength(1)
  @MaxLength(MAXTEXT)
  dor!: string;

  @aparado()
  @IsString()
  @MaxLength(MAXTEXT)
  oferta!: string;

  @aparado()
  @IsString()
  @MinLength(1)
  @MaxLength(MAXTEXT)
  mensagem_chave!: string;

  @IsArray()
  @ArrayMaxSize(MAX_PROVAS)
  @IsUUID(undefined, { each: true })
  provas!: string[];

  @IsIn(DESTINO_IDS, umDe(DESTINO_IDS))
  destino!: string;

  @aparado()
  @IsString()
  @MaxLength(120)
  kpi_name!: string;

  @IsNumber()
  @Min(0)
  @Max(10_000_000)
  kpi_meta!: number;

  @IsNumber()
  @Min(0)
  @Max(10_000_000)
  kpi_custo!: number;

  @IsNumber()
  @Min(0)
  @Max(10_000_000)
  cac_teto!: number;

  // Sem default: ausente = "rascunho" no `POST` e "mantém o que já era" no
  // `PUT`. Um default aqui rebaixaria campanha ativa a rascunho por omissão.
  @Opcional()
  @IsIn(CAMPANHA_STATUS, umDe(CAMPANHA_STATUS))
  status?: string;

  @Opcional()
  @aparado()
  @IsString()
  @MinLength(JUST_MIN)
  @MaxLength(MAXTEXT)
  justification?: string;
}

export class CampanhaStatusDto {
  @IsIn(CAMPANHA_STATUS, umDe(CAMPANHA_STATUS))
  status!: string;

  @Opcional()
  @aparado()
  @IsString()
  @MinLength(JUST_MIN)
  @MaxLength(MAXTEXT)
  justification?: string;
}

export class DuplicateCampanhaDto {
  @IsUUID()
  praca_id!: string;
}

export class SuggestNameDto {
  @IsUUID()
  praca_id!: string;

  @IsIn(PUBLICOS, umDe(PUBLICOS))
  publico!: string;

  @IsIn(OBJETIVO_IDS, umDe(OBJETIVO_IDS))
  objetivo!: string;

  @IsDayString()
  start!: string;
}

// ── criativos ──────────────────────────────────────────────────
export class CreativesQueryDto {
  @IsUUID()
  campanha_id!: string;
}

export class RoteiroDto {
  @aparado()
  @IsString()
  @MaxLength(1000)
  gancho!: string;

  @aparado()
  @IsString()
  @MaxLength(1000)
  desenvolvimento!: string;

  @aparado()
  @IsString()
  @MaxLength(1000)
  prova!: string;

  @aparado()
  @IsString()
  @MaxLength(1000)
  cta!: string;
}

/** Ferramenta de IA e o prompt usado — só para formato de vídeo/imagem gerada. */
export class IaDto {
  @IsIn(IA_TOOLS, umDe(IA_TOOLS))
  tool!: string;

  @aparado()
  @IsString()
  @MaxLength(2000)
  prompt!: string;
}

export class CreativeBodyDto {
  @IsUUID()
  campanha_id!: string;

  @IsIn(FORMATO_IDS, umDe(FORMATO_IDS))
  formato!: string;

  @aparado()
  @IsString()
  @MaxLength(120)
  titulo!: string;

  @aparado()
  @IsString()
  @MaxLength(240)
  gancho!: string;

  @IsObject()
  @ValidateNested()
  @Type(() => RoteiroDto)
  roteiro!: RoteiroDto;

  @aparado()
  @IsString()
  @MaxLength(1000)
  legenda!: string;

  @aparado()
  @IsString()
  @MaxLength(40)
  cta_botao!: string;

  // `null` = ninguém responsável ainda (o protótipo guarda string vazia).
  @IsOptional()
  @IsUUID()
  owner_id: string | null = null;

  @IsDayString()
  due!: string;

  @IsOptional()
  @IsDayString()
  publish_at: string | null = null;

  @IsIn(CREATIVE_STATUS_IDS, umDe(CREATIVE_STATUS_IDS))
  status!: string;

  @Opcional()
  @aparado()
  @IsString()
  @MaxLength(500)
  file_url: string = '';

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => IaDto)
  ia: IaDto | null = null;
}

export class CreativeStatusDto {
  @IsIn(CREATIVE_STATUS_IDS, umDe(CREATIVE_STATUS_IDS))
  status!: string;
}

export class PublishDateDto {
  @IsDayString()
  date!: string;
}

/**
 * Revisão do criativo. Em `ajuste` o texto é obrigatório (o botão do protótipo
 * fica travado sem ele); em `aprovacao`, texto vazio cai no "Aprovado.".
 */
export class ReviewCreativeDto {
  @IsIn(REVIEW_KINDS, umDe(REVIEW_KINDS))
  kind!: string;

  @Opcional()
  @aparado()
  @IsString()
  @MaxLength(1000)
  text: string = '';
}

// ── tráfego ────────────────────────────────────────────────────
export class TrafficQueryDto {
  @IsUUID()
  campanha_id!: string;
}

export class TrafficBodyDto {
  @IsUUID()
  campanha_id!: string;

  @IsIn(PLATAFORMAS, umDe(PLATAFORMAS))
  plataforma!: string;

  @aparado()
  @IsString()
  @MaxLength(120)
  nome_la!: string;

  @aparado()
  @IsString()
  @MaxLength(300)
  publico!: string;

  @aparado()
  @IsString()
  @MaxLength(200)
  geo!: string;

  @IsNumber()
  @Min(0)
  @Max(1_000_000)
  verba_diaria!: number;

  @IsArray()
  @ArrayMaxSize(MAX_CRIATIVOS)
  @IsUUID(undefined, { each: true })
  criativos!: string[];

  // Link do gerenciador (Meta/Google) ou vazio.
  @Opcional()
  @aparado()
  @IsString()
  @MaxLength(500)
  @Matches(/^(https?:\/\/\S+)?$/, { message: 'deve ser um endereço http(s) ou vazio' })
  manager_url: string = '';

  @Opcional()
  @IsBoolean()
  api_connected: boolean = false;
}

export class TrafficDayDto {
  @IsDayString()
  date!: string;

  @IsNumber()
  @Min(0)
  @Max(10_000_000)
  investido!: number;

  @IsInt()
  @Min(0)
  @Max(1_000_000_000)
  alcance!: number;

  @IsInt()
  @Min(0)
  @Max(1_000_000_000)
  cliques!: number;

  @IsInt()
  @Min(0)
  @Max(1_000_000_000)
  conversoes!: number;

  // `true` = veio da API da plataforma, não do lançamento na mão.
  @Opcional()
  @IsBoolean()
  auto: boolean = false;
}
