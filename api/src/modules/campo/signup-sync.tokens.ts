import type { Provider } from '@nestjs/common';
import { validateEnv } from '../../common/config/env.validation';

export interface OpcoesSignupSync {
  ligado: boolean;
  intervaloMin: number;
  janelaDias: number;
}

/** `FIELD_SIGNUP_SYNC_*` (contrato §27.9). */
export const SIGNUP_SYNC_OPCOES = Symbol('SIGNUP_SYNC_OPCOES');

export const signupSyncOpcoesProvider: Provider = {
  provide: SIGNUP_SYNC_OPCOES,
  useFactory: (): OpcoesSignupSync => {
    const e = validateEnv(process.env);
    return {
      ligado: e.FIELD_SIGNUP_SYNC_ENABLED === 'true',
      intervaloMin: e.FIELD_SIGNUP_SYNC_INTERVAL_MIN,
      janelaDias: e.FIELD_SIGNUP_RECONCILE_DAYS,
    };
  },
};
