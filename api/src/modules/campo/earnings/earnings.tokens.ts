import type { Provider } from '@nestjs/common';
import { validateEnv } from '../../../common/config/env.validation';

export interface OpcoesEarnings {
  ligado: boolean;
  autoClose: boolean;
  /** Janela dos "ainda não confirmados" mostrados ao consultor (mesma da reconciliação do F7). */
  janelaNaoConfirmadosDias: number;
}

/** `FIELD_EARNINGS_ENABLED` / `FIELD_EARNINGS_AUTOCLOSE_ENABLED` (contrato §28.8). */
export const EARNINGS_OPCOES = Symbol('EARNINGS_OPCOES');

export const earningsOpcoesProvider: Provider = {
  provide: EARNINGS_OPCOES,
  useFactory: (): OpcoesEarnings => {
    const e = validateEnv(process.env);
    return {
      ligado: e.FIELD_EARNINGS_ENABLED === 'true',
      autoClose: e.FIELD_EARNINGS_ENABLED === 'true' && e.FIELD_EARNINGS_AUTOCLOSE_ENABLED === 'true',
      janelaNaoConfirmadosDias: e.FIELD_SIGNUP_RECONCILE_DAYS,
    };
  },
};
