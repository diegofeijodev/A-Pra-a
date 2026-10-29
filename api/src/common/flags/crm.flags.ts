import { Global, Module, type Provider } from '@nestjs/common';
import { validateEnv } from '../config/env.validation';

/**
 * CRM automático (contrato §47): as cinco chaves, todas desligadas por padrão. Módulo GLOBAL, como o `UiFlagsModule`: o
 * `modules/crm/` e os módulos que o `crm/` só lê não precisam importar nada. Quem injeta `CRM_FLAGS` usa
 * `@Optional() @Inject(CRM_FLAGS)` como ÚLTIMO parâmetro do construtor (os testes montam por posição).
 */
export interface FlagsCrm {
  tasks: boolean;
  auto_leads: boolean;
  auto_stages: boolean;
  auto_lost: boolean;
  freela_pipeline: boolean;
}
export const CRM_FLAGS = Symbol('CRM_FLAGS');

/** Todas desligadas: o que vale quando o provedor não existe (testes que montam o serviço à mão). */
export const CRM_DESLIGADAS: Readonly<FlagsCrm> = Object.freeze({
  tasks: false,
  auto_leads: false,
  auto_stages: false,
  auto_lost: false,
  freela_pipeline: false,
});

export function lerFlagsCrm(env: Record<string, unknown> = process.env): FlagsCrm {
  const e = validateEnv(env);
  return {
    tasks: e.CRM_TASKS_ENABLED === 'true',
    auto_leads: e.CRM_AUTO_LEADS_FROM_SEARCH_ENABLED === 'true',
    auto_stages: e.CRM_AUTO_STAGES_ENABLED === 'true',
    auto_lost: e.CRM_AUTO_LOST_ENABLED === 'true',
    freela_pipeline: e.CRM_FREELA_PIPELINE_ENABLED === 'true',
  };
}

export const crmFlagsProvider: Provider = {
  provide: CRM_FLAGS,
  useFactory: (): FlagsCrm => lerFlagsCrm(),
};

@Global()
@Module({ providers: [crmFlagsProvider], exports: [CRM_FLAGS] })
export class CrmFlagsModule {}
