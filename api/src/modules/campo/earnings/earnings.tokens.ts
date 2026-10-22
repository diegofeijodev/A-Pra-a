import type { Provider } from '@nestjs/common';
import { validateEnv } from '../../../common/config/env.validation';

export interface OpcoesEarnings {
  ligado: boolean;
  autoClose: boolean;
  /** Janela dos "ainda não confirmados" mostrados ao consultor (mesma da reconciliação do F7). */
  janelaNaoConfirmadosDias: number;
  /** `FIELD_ROUTES_ENABLED` (a diária `route_assigned` só existe com rotas da equipe, contrato §32.1). */
  rotasLigadas?: boolean;
  /** `FIELD_DECLARED_SIGNUPS_ENABLED` E `FIELD_EARNINGS_ENABLED` (contrato §32.5). */
  declaradasLigado?: boolean;
  /** Lote B §37.6: `FIELD_BREAKS_ENABLED` (a diária com tempo trabalhado mínimo desconta o intervalo). */
  intervaloLigado?: boolean;
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
      rotasLigadas: e.FIELD_ROUTES_ENABLED === 'true',
      declaradasLigado: e.FIELD_EARNINGS_ENABLED === 'true' && e.FIELD_DECLARED_SIGNUPS_ENABLED === 'true',
      intervaloLigado: e.FIELD_BREAKS_ENABLED === 'true',
    };
  },
};
