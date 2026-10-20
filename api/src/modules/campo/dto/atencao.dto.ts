import { IsOptional, IsUUID } from 'class-validator';

/** Query de `attention` e `followups` da equipe (contrato §25.3/§25.4): praça opcional. */
export class PracaOpcionalQueryDto {
  @IsOptional() @IsUUID() praca_id?: string;
}
