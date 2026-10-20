import type { Provider } from '@nestjs/common';
import { validateEnv } from '../../common/config/env.validation';

/** `FIELD_COMPANY_SIGNUP_ENABLED=true`: liga o cadastro assistido da empresa no Freela (contrato §26). */
export const COMPANY_SIGNUP_LIGADO = Symbol('COMPANY_SIGNUP_LIGADO');

// O `.env` já está em `process.env` (ConfigModule.forRoot) e foi validado na largada.
export const companySignupLigadoProvider: Provider = {
  provide: COMPANY_SIGNUP_LIGADO,
  useFactory: (): boolean => validateEnv(process.env).FIELD_COMPANY_SIGNUP_ENABLED === 'true',
};
