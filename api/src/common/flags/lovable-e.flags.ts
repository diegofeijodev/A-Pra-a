import { Global, Module, type Provider } from '@nestjs/common';
import { validateEnv } from '../config/env.validation';

/**
 * Restante da Lovable, lote E (contrato §41, §42): regra de senha nova, cadastro do consultor, e-mail de quem atendeu e o perfil
 * gestor. São transversais (guarda global, pessoas, campo), por isso moram num módulo GLOBAL e não num módulo de produto.
 */
export interface FlagsLovableE {
  password_policy: boolean;
  consultant_profile: boolean;
  contact_email: boolean;
  team_gestor: boolean;
}
export const LOVABLE_E_FLAGS = Symbol('LOVABLE_E_FLAGS');

/** Todas desligadas: o que vale quando o provedor não existe (testes que montam o serviço à mão). */
export const LOVABLE_E_DESLIGADAS: FlagsLovableE = Object.freeze({
  password_policy: false,
  consultant_profile: false,
  contact_email: false,
  team_gestor: false,
});

export function lerFlagsLovableE(env: Record<string, unknown> = process.env): FlagsLovableE {
  const e = validateEnv(env);
  return {
    password_policy: e.PASSWORD_POLICY_ENABLED === 'true',
    consultant_profile: e.FIELD_CONSULTANT_PROFILE_ENABLED === 'true',
    contact_email: e.FIELD_CONTACT_EMAIL_ENABLED === 'true',
    team_gestor: e.TEAM_GESTOR_ENABLED === 'true',
  };
}

export const lovableEFlagsProvider: Provider = {
  provide: LOVABLE_E_FLAGS,
  useFactory: (): FlagsLovableE => lerFlagsLovableE(),
};

@Global()
@Module({ providers: [lovableEFlagsProvider], exports: [LOVABLE_E_FLAGS] })
export class LovableEFlagsModule {}
