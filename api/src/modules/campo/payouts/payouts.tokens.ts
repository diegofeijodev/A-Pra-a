import type { Provider } from '@nestjs/common';
import { validateEnv } from '../../../common/config/env.validation';

export interface OpcoesPayouts {
  /** `FIELD_PAYOUTS_ENABLED` E `FIELD_EARNINGS_ENABLED` (contrato §29). */
  ligado: boolean;
}

export const PAYOUTS_OPCOES = Symbol('PAYOUTS_OPCOES');

export const payoutsOpcoesProvider: Provider = {
  provide: PAYOUTS_OPCOES,
  useFactory: (): OpcoesPayouts => {
    const e = validateEnv(process.env);
    return { ligado: e.FIELD_PAYOUTS_ENABLED === 'true' && e.FIELD_EARNINGS_ENABLED === 'true' };
  },
};
