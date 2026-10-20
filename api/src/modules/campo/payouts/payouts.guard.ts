import { CanActivate, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PAYOUTS_OPCOES, type OpcoesPayouts } from './payouts.tokens';

export const payoutsDesligado = () =>
  new NotFoundException({
    code: 'PAYOUTS_DISABLED',
    message: 'O pagamento dos consultores não está habilitado.',
  });

/** Flag desligada (ou remuneração desligada) = 404 em todas as rotas de pagamento (contrato §29). */
@Injectable()
export class PayoutsLigadoGuard implements CanActivate {
  constructor(@Inject(PAYOUTS_OPCOES) private readonly opcoes: OpcoesPayouts) {}

  canActivate(): boolean {
    if (!this.opcoes.ligado) throw payoutsDesligado();
    return true;
  }
}
