import { CanActivate, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { EARNINGS_OPCOES, type OpcoesEarnings } from '../earnings/earnings.tokens';

export const declaradasDesligado = () =>
  new NotFoundException({
    code: 'DECLARED_DISABLED',
    message: 'O ganho por cadastro declarado não está habilitado.',
  });

/** Flag desligada (ou remuneração desligada) = 404 em todas as rotas do cadastro declarado (contrato §32.5). */
@Injectable()
export class DeclaredLigadoGuard implements CanActivate {
  constructor(@Inject(EARNINGS_OPCOES) private readonly opcoes: OpcoesEarnings) {}

  canActivate(): boolean {
    if (!this.opcoes.declaradasLigado) throw declaradasDesligado();
    return true;
  }
}
