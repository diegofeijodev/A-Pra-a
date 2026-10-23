import { validateEnv } from '../config/env.validation';

/**
 * Restante da Lovable, lote F2 (contrato §44): consultor em várias praças. Transversal (o `CampoAuthGuard` em `common/`, o campo,
 * os roteiros, o painel, a Atenção, o mapa de calor, o cadastro confirmado e o DELETE da praça), por isso a flag e o serviço moram
 * num módulo GLOBAL (`common/pracas/pracas-do-consultor.module.ts`).
 */
export const MULTI_PRACA_LIGADO = Symbol('MULTI_PRACA_LIGADO');

export function lerMultiPraca(env: Record<string, unknown> = process.env): boolean {
  return validateEnv(env).FIELD_MULTI_PRACA_ENABLED === 'true';
}
