import { CanActivate, Inject, Injectable } from '@nestjs/common';
import { LOVABLE_C_FLAGS, type FlagsLovableC } from '../../rotas/rotas.tokens';
import { vouchersDesligados } from './vouchers.service';

/**
 * `FIELD_VOUCHERS_ENABLED` desligada = `404 VOUCHERS_DISABLED` em todas as rotas de cupom (contrato §38.1). O guard global
 * (sessão) roda antes: token de consultor numa rota da equipe continua `401`.
 */
@Injectable()
export class VouchersLigadoGuard implements CanActivate {
  constructor(@Inject(LOVABLE_C_FLAGS) private readonly flags: FlagsLovableC) {}
  canActivate(): boolean {
    if (!this.flags.vouchers) throw vouchersDesligados();
    return true;
  }
}
