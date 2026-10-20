import type { Provider } from '@nestjs/common';
import { validateEnv } from '../../common/config/env.validation';
import { VELOCIDADE_CARRO_PADRAO } from '../../domain/rota-rules';

/** `FIELD_ROUTES_ENABLED=true`: liga todo o roteiro do dia (contrato §23). */
export const ROTAS_LIGADAS = Symbol('ROTAS_LIGADAS');

// O `.env` já está em `process.env` (ConfigModule.forRoot) e foi validado na largada.
export const rotasLigadasProvider: Provider = {
  provide: ROTAS_LIGADAS,
  useFactory: (): boolean => validateEnv(process.env).FIELD_ROUTES_ENABLED === 'true',
};

/**
 * `ROTA_VELOCIDADE_CARRO_KMH` (contrato §30.4): média urbana de carro em km/h, 5–80. Lê direto do
 * ambiente (sem `validateEnv`, que exige as demais variáveis) e cai em 25 se vazio ou fora da faixa.
 */
export function velocidadeCarroKmh(env: Record<string, string | undefined> = process.env): number {
  const bruto = env.ROTA_VELOCIDADE_CARRO_KMH;
  if (bruto == null || bruto.trim() === '') return VELOCIDADE_CARRO_PADRAO;
  const n = Number(bruto);
  return Number.isFinite(n) && n >= 5 && n <= 80 ? n : VELOCIDADE_CARRO_PADRAO;
}

/** `FIELD_VISIT_FLOW_SELECT_ENABLED=true`: liga a escolha do fluxo da visita (simples x completo, contrato §31). */
export const FLUXO_SELECT_LIGADO = Symbol('FLUXO_SELECT_LIGADO');

export const fluxoSelectLigadoProvider: Provider = {
  provide: FLUXO_SELECT_LIGADO,
  useFactory: (): boolean => validateEnv(process.env).FIELD_VISIT_FLOW_SELECT_ENABLED === 'true',
};
