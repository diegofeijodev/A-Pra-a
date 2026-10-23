import { CanActivate, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { EARNINGS_OPCOES, type OpcoesEarnings } from './earnings.tokens';

export const earningsDesligado = () =>
  new NotFoundException({
    code: 'EARNINGS_DISABLED',
    message: 'A remuneração dos consultores não está habilitada.',
  });

/** Flag desligada = 404 em todas as rotas da remuneração (contrato §28). */
@Injectable()
export class EarningsLigadoGuard implements CanActivate {
  constructor(@Inject(EARNINGS_OPCOES) private readonly opcoes: OpcoesEarnings) {}

  canActivate(): boolean {
    if (!this.opcoes.ligado) throw earningsDesligado();
    return true;
  }
}

export const porConsultorDesligado = () =>
  new NotFoundException({
    code: 'PER_CONSULTANT_DISABLED',
    message: 'A regra de pagamento por consultor não está habilitada.',
  });

/** L13 §45.1: rotas da regra por consultor só existem com a flag (e a remuneração) ligadas. */
@Injectable()
export class PorConsultorLigadoGuard implements CanActivate {
  constructor(@Inject(EARNINGS_OPCOES) private readonly opcoes: OpcoesEarnings) {}

  canActivate(): boolean {
    if (!this.opcoes.porConsultorLigado) throw porConsultorDesligado();
    return true;
  }
}
