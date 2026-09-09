import { Type } from 'class-transformer';
import {
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
  registerDecorator,
  type ValidationOptions,
} from 'class-validator';
import { AUDIENCES, CHANNELS, SEND_MODES, TEMPLATE_DEFAULT_KEYS } from '../../../domain/catalog/messages';

const AUDIENCE_IDS = AUDIENCES.map((a) => a.id);
const CHANNEL_IDS = CHANNELS.map((c) => c.id);
const MODE_IDS = SEND_MODES.map((m) => m.id);
const ATTACHMENT_KINDS = ['video', 'imagem', 'documento'];

// ── modelos ──────────────────────────────────────────────────
export class AttachmentDto {
  @IsIn(ATTACHMENT_KINDS, { message: `deve ser um de: ${ATTACHMENT_KINDS.join(', ')}` })
  kind!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  url?: string;
}

/** Corpo do POST e do PUT — o PUT substitui o modelo inteiro. */
export class TemplateBodyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string;

  @IsIn(AUDIENCE_IDS, { message: `deve ser um de: ${AUDIENCE_IDS.join(', ')}` })
  audience!: string;

  // 0 = vale para qualquer etapa (é o que os modelos de freelancer usam).
  @IsInt()
  @Min(0)
  @Max(8)
  stage!: number;

  @IsIn(CHANNEL_IDS, { message: `deve ser um de: ${CHANNEL_IDS.join(', ')}` })
  channel!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  text_a!: string;

  // Variante B é opcional e pode ser "" — modelo sem teste A/B.
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  text_b?: string;

  // `null` explícito tira o anexo; ausente também. `@IsOptional()` pula os
  // dois casos, então o `ValidateNested` só roda quando veio objeto.
  @IsOptional()
  @ValidateNested()
  @Type(() => AttachmentDto)
  attachment?: AttachmentDto | null;
}

export class RenderTemplateDto {
  @IsString()
  @MaxLength(4000)
  text!: string;

  @IsOptional()
  @IsUUID()
  lead_id?: string;
}

// ── configurações de envio ───────────────────────────────────
/** `template_defaults` parcial: só as 6 chaves conhecidas, valores curtos. */
function IsTemplateDefaults(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isTemplateDefaults',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate: (value: unknown) => {
          if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
          return Object.entries(value as Record<string, unknown>).every(
            ([k, v]) =>
              (TEMPLATE_DEFAULT_KEYS as readonly string[]).includes(k) &&
              typeof v === 'string' &&
              v.length <= 300,
          );
        },
        defaultMessage: () =>
          `aceita só ${TEMPLATE_DEFAULT_KEYS.join(', ')}, com texto de até 300 caracteres`,
      },
    });
  };
}

export class UpdateSettingsDto {
  @IsOptional()
  @IsIn(MODE_IDS, { message: `deve ser um de: ${MODE_IDS.join(', ')}` })
  mode?: string;

  // A janela é PRESA em 8h–20h pelo servidor (`clampHour`), não recusada: o
  // 0..23 daqui é só para barrar hora que não existe.
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  window_start?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  window_end?: number;

  @IsOptional()
  @IsBoolean()
  sunday?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10_000)
  daily_limit?: number;

  // Intervalo em segundos. Menos de 5s entre mensagens é o caminho curto para
  // o número ser bloqueado.
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(86_400)
  gap_min?: number;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(86_400)
  gap_max?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10_000)
  daily_quota?: number;

  @IsOptional()
  @IsObject()
  @IsTemplateDefaults()
  template_defaults?: Record<string, string>;
}

// ── lista de bloqueio ────────────────────────────────────────
export class CreateBlockDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  phone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;

  @IsOptional()
  @IsUUID()
  lead_id?: string;
}
