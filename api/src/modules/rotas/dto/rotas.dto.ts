import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsISO8601,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { IsDayString } from '../../../common/validation/is-day.decorator';
import { MODOS_DESLOCAMENTO } from '../../../domain/rota-rules';

export const MOTIVOS_PULO = ['fechado', 'sem_dono', 'ja_cliente', 'outro'] as const;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Parâmetros de negócio (contrato §23.1). Tudo opcional: o PUT é parcial. A faixa é conferida no domínio. */
export class ConfigRotaDto {
  @IsOptional() @IsInt() @Min(1) @Max(100) meta_diaria?: number;
  @IsOptional() @Matches(HHMM) janela_inicio?: string;
  @IsOptional() @Matches(HHMM) janela_fim?: string;
  @IsOptional() @Matches(HHMM) almoco_inicio?: string;
  @IsOptional() @Matches(HHMM) almoco_fim?: string;
  @IsOptional() @IsInt() @Min(1) @Max(120) minutos_por_visita?: number;
  @IsOptional() @IsNumber() @Min(1) @Max(15) velocidade_kmh?: number;
  @IsOptional() @IsNumber() @Min(1) @Max(3) fator_desvio?: number;
  @IsOptional() @IsNumber() @Min(1) @Max(5) pool_fator?: number;
  @IsOptional() @IsInt() @Min(0) @Max(365) dias_sem_revisitar?: number;
  @IsOptional() @IsInt() @Min(1) @Max(6) estagio_maximo_rota?: number;
  @IsOptional() @IsBoolean() gerar_ao_iniciar?: boolean;
  @IsOptional() @IsBoolean() consultor_pode_gerar?: boolean;
  // F5 (contrato §25.1): limiares de "Atenção agora". A faixa é conferida no domínio.
  @IsOptional() @IsInt() @Min(0) @Max(240) alerta_inicio_apos_min?: number;
  @IsOptional() @IsInt() @Min(5) @Max(480) alerta_visita_aberta_min?: number;
  @IsOptional() @IsInt() @Min(5) @Max(480) alerta_sem_registro_min?: number;
  @IsOptional() @IsInt() @Min(1) @Max(100) alerta_ritmo_atras?: number;
  @IsOptional() @IsInt() @Min(5) @Max(240) alerta_parada_vencida_min?: number;
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(7) @IsInt({ each: true }) @Min(0, { each: true }) @Max(6, { each: true }) dias_trabalho?: number[];
  @IsOptional() @IsBoolean() retornos_no_roteiro?: boolean;
  // F9 (contrato §29.3): comprovante obrigatório ao marcar o Pix como pago.
  @IsOptional() @IsBoolean() payout_proof_required?: boolean;
  // F7 (contrato §27.4): regra de "cadastro confirmado". Os valores são conferidos no domínio.
  @IsOptional() @IsString() confirmation_rule?: string;
  // Modo do chefe (contrato §31.3): os valores/subconjuntos são conferidos no domínio (`modo-campo-rules.ts`).
  @IsOptional() @IsIn(['simples', 'completo']) fluxo_visita?: string | null;
  @IsOptional() @IsIn(['nao', 'opcional', 'obrigatoria']) justificativa_distancia?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) contato_obrigatorio_em?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) contato_campos?: string[];
  @IsOptional() @IsBoolean() fechado_conta_na_meta?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(30) desfazer_segundos?: number;
  // S3 (contrato §32.7): alerta de divergência do ganho declarado.
  @IsOptional() @IsInt() @Min(1) @Max(1000) divergencia_alerta_min?: number;
  @IsOptional() @IsInt() @Min(1) @Max(100) divergencia_alerta_pct?: number;
  // Restante da Lovable (contrato §23.1 e §33.2): sem inicializador; `null` vale como ausente; a faixa é conferida no domínio.
  @IsOptional() @IsInt() @Min(50) @Max(1000) raio_checkin_m?: number | null;
  @IsOptional() @IsIn(['nota', 'numeros', 'desligado']) ui_resumo_dia?: string | null;
  @IsOptional() @IsInt() @Min(0) @Max(10) nota_peso_rota?: number | null;
  @IsOptional() @IsInt() @Min(0) @Max(10) nota_peso_conversao?: number | null;
  @IsOptional() @IsInt() @Min(1) @Max(100) nota_meta_conversao_pct?: number | null;
  @IsOptional() @IsInt() @Min(15) @Max(480) nota_intervalo_alerta_min?: number | null;
  @IsOptional() @IsIn(['intervalo', 'duracao']) painel_tempo_medio?: string | null;
  @IsOptional() @IsInt() @Min(10) @Max(480) painel_gap_max_min?: number | null;
  // Lote B (contrato §35.2): checklist da visita. A forma de cada etapa ({ id?, text }) é conferida no domínio (`prepararItensChecklist`).
  @IsOptional() @IsArray() @ArrayMaxSize(20) checklist_items?: unknown[] | null;
  @IsOptional() @IsIn(['nao', 'todas']) checklist_obrigatorio?: string | null;
  @IsOptional() @IsArray() @ArrayMaxSize(2) @IsIn(['simples', 'completo'], { each: true }) checklist_fluxos?: string[] | null;
  @IsOptional() @IsBoolean() checklist_aberto?: boolean | null;
}

export class PosicaoRotaDto {
  @IsUUID() client_id!: string;
  @Type(() => Number) @IsLatitude() lat!: number;
  @Type(() => Number) @IsLongitude() lng!: number;
  @IsOptional() @IsISO8601({ strict: true }) at?: string;
}

export class GerarRotaDto {
  @IsUUID() client_id!: string;
  @Type(() => Number) @IsLatitude() lat!: number;
  @Type(() => Number) @IsLongitude() lng!: number;
}

export class PularParadaDto {
  @IsUUID() client_id!: string;
  @IsIn(MOTIVOS_PULO) reason!: (typeof MOTIVOS_PULO)[number];
  @IsOptional() @IsString() @MaxLength(200) note?: string;
  @IsOptional() @IsISO8601({ strict: true }) at?: string;
}

export class AcaoParadaDto {
  @IsUUID() client_id!: string;
  @IsOptional() @IsISO8601({ strict: true }) at?: string;
}

// ── equipe ──────────────────────────────────────────────────
export class PontoDto {
  @Type(() => Number) @IsLatitude() lat!: number;
  @Type(() => Number) @IsLongitude() lng!: number;
}

export class MontarRotaDto {
  @IsUUID() consultant_id!: string;
  @IsDayString() day!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @IsUUID('all', { each: true }) lead_ids!: string[];
  @IsOptional() @IsUUID() area_id?: string;
  @IsOptional() @ValidateNested() @Type(() => PontoDto) start?: PontoDto;
  /** Contrato §30.4. SEM inicializador: ausente = mantém o modo do roteiro existente (ou `a_pe` num novo). */
  @IsOptional() @IsIn([...MODOS_DESLOCAMENTO]) travel_mode?: string;
}

export class RotasQueryDto {
  @IsOptional() @IsDayString() day?: string;
  @IsOptional() @IsUUID() praca_id?: string;
}

export class CandidatosQueryDto {
  @IsUUID() praca_id!: string;
  @IsOptional() @IsDayString() day?: string;
  @IsOptional() @IsUUID() area_id?: string;
  @IsOptional() @IsString() @MaxLength(80) q?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
}

export class ParadaOrdemDto {
  @IsUUID() id!: string;
  @IsOptional() @IsBoolean() fixa?: boolean;
}

export class OrdenarRotaDto {
  @Type(() => Number) @IsInt() @Min(1) version!: number;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(250) @ValidateNested({ each: true }) @Type(() => ParadaOrdemDto) stops!: ParadaOrdemDto[];
}

export class ReotimizarEquipeDto {
  @IsOptional() @Type(() => Number) @IsLatitude() lat?: number;
  @IsOptional() @Type(() => Number) @IsLongitude() lng?: number;
}
