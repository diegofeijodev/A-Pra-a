import { Global, Module, type Provider } from '@nestjs/common';
import { validateEnv } from '../config/env.validation';

/**
 * Casca da Lovable (contrato §46): as flags que o web lê para montar o menu da equipe sem sondar rota desligada. Só leitura:
 * nenhuma rota muda com elas. `commercial` é nova (`TEAM_COMMERCIAL_ENABLED`); as outras repetem a conta que os módulos donos
 * já fazem (`payouts.tokens.ts`, `earnings.tokens.ts`), para o menu e a API nunca discordarem. Módulo GLOBAL, como o do lote E:
 * o `RotasModule` continua folha.
 */
export interface FlagsUi {
  commercial: boolean;
  routes: boolean;
  earnings: boolean;
  payouts: boolean;
  declared_signups: boolean;
}
export const UI_FLAGS = Symbol('UI_FLAGS');

/** Todas desligadas: o que vale quando o provedor não existe (testes que montam o controller à mão). */
export const UI_DESLIGADAS: FlagsUi = Object.freeze({
  commercial: false,
  routes: false,
  earnings: false,
  payouts: false,
  declared_signups: false,
});

export function lerFlagsUi(env: Record<string, unknown> = process.env): FlagsUi {
  const e = validateEnv(env);
  const earnings = e.FIELD_EARNINGS_ENABLED === 'true';
  return {
    commercial: e.TEAM_COMMERCIAL_ENABLED === 'true',
    routes: e.FIELD_ROUTES_ENABLED === 'true',
    earnings,
    // Pix (§29) e cadastro declarado (§32.5) só valem com a remuneração ligada.
    payouts: earnings && e.FIELD_PAYOUTS_ENABLED === 'true',
    declared_signups: earnings && e.FIELD_DECLARED_SIGNUPS_ENABLED === 'true',
  };
}

export const uiFlagsProvider: Provider = {
  provide: UI_FLAGS,
  useFactory: (): FlagsUi => lerFlagsUi(),
};

@Global()
@Module({ providers: [uiFlagsProvider], exports: [UI_FLAGS] })
export class UiFlagsModule {}
