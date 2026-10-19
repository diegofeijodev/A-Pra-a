import type { Provider } from '@nestjs/common';
import { validateEnv } from '../../common/config/env.validation';

/** `FIELD_ROUTES_ENABLED=true`: liga todo o roteiro do dia (contrato §23). */
export const ROTAS_LIGADAS = Symbol('ROTAS_LIGADAS');

// O `.env` já está em `process.env` (ConfigModule.forRoot) e foi validado na largada.
export const rotasLigadasProvider: Provider = {
  provide: ROTAS_LIGADAS,
  useFactory: (): boolean => validateEnv(process.env).FIELD_ROUTES_ENABLED === 'true',
};
