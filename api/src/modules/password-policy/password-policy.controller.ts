import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional } from 'class-validator';
import { AdminOnly } from '../../common/decorators/admin-only.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { PasswordPolicyService } from './password-policy.service';

/** `null` = ausente (o web reenvia o que recebeu); a faixa é conferida no domínio (`senha-rules.ts`). */
export class PutPasswordPolicyDto {
  @IsOptional() @IsInt() min_length?: number | null;
  @IsOptional() @IsBoolean() require_upper?: boolean | null;
  @IsOptional() @IsBoolean() require_digit?: boolean | null;
}

/** Regra de senha nova (contrato §41.2). A leitura é pública: não é segredo e a tela da senha provisória a usa. */
@ApiTags('Senha')
@ApiBearerAuth()
@Controller('v1/password-policy')
export class PasswordPolicyController {
  constructor(private readonly policy: PasswordPolicyService) {}

  @Public()
  @Get()
  get() {
    return this.policy.view();
  }

  @AdminOnly()
  @Put()
  put(@Body() dto: PutPasswordPolicyDto) {
    return this.policy.salvar(dto);
  }
}
