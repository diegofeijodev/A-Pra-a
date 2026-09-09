import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

const aparado = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

/**
 * Corpo do formulário público de captura (`.prototype/src/routes/formulario.$pracaId.tsx`).
 * `camp` fica solto (sem `@IsUUID()`): id de campanha inválido é **ignorado**
 * pelo serviço, não vira `400` — o link do anúncio não pode quebrar o
 * formulário por causa de um parâmetro de rastreio malformado.
 */
export class CreatePublicLeadDto {
  @IsUUID()
  praca_id!: string;

  @aparado()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @aparado()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  city!: string;

  @aparado()
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  phone!: string;

  @IsOptional()
  @aparado()
  @IsString()
  @MaxLength(120)
  decisor?: string;

  @IsOptional()
  @IsIn(['0', '2', '5', '10'])
  freq?: '0' | '2' | '5' | '10';

  @IsIn(['pago', 'organico'])
  origem!: 'pago' | 'organico';

  @IsOptional()
  @aparado()
  @IsString()
  @MaxLength(64)
  camp?: string;
}
