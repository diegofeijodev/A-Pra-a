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

/** Restante da Lovable, lote A (contrato §33.1, §34): painel, resumo do dia e mapa de pinos. */
export interface FlagsLovableA {
  dashboard: boolean;
  day_summary: boolean;
  map_pins: boolean;
}
export const LOVABLE_A_FLAGS = Symbol('LOVABLE_A_FLAGS');

/** Restante da Lovable, lote B (contrato §35, §37): checklist da visita e intervalo da jornada. */
export interface FlagsLovableB {
  checklist: boolean;
  breaks: boolean;
}
export const LOVABLE_B_FLAGS = Symbol('LOVABLE_B_FLAGS');

export const lovableBFlagsProvider: Provider = {
  provide: LOVABLE_B_FLAGS,
  useFactory: (): FlagsLovableB => {
    const e = validateEnv(process.env);
    return { checklist: e.FIELD_CHECKLIST_ENABLED === 'true', breaks: e.FIELD_BREAKS_ENABLED === 'true' };
  },
};

export const lovableAFlagsProvider: Provider = {
  provide: LOVABLE_A_FLAGS,
  useFactory: (): FlagsLovableA => {
    const e = validateEnv(process.env);
    return {
      dashboard: e.FIELD_DASHBOARD_ENABLED === 'true',
      day_summary: e.FIELD_DAY_SUMMARY_ENABLED === 'true',
      map_pins: e.FIELD_MAP_PINS_ENABLED === 'true',
    };
  },
};

/**
 * Restante da Lovable, lote C (contrato §36, §38): segmentos editáveis da busca, pedidos de cupom e o cupom real no Freela.
 * `voucher_coupons` só vale com `vouchers` (como os pagamentos exigem a remuneração): sem ela, a porta do cupom é o `NoopIssuer`.
 */
export interface FlagsLovableC {
  segments: boolean;
  vouchers: boolean;
  voucher_coupons: boolean;
}
export const LOVABLE_C_FLAGS = Symbol('LOVABLE_C_FLAGS');

export function lerFlagsLovableC(env: Record<string, unknown> = process.env): FlagsLovableC {
  const e = validateEnv(env);
  const vouchers = e.FIELD_VOUCHERS_ENABLED === 'true';
  return {
    segments: e.FIELD_SEGMENTS_ENABLED === 'true',
    vouchers,
    voucher_coupons: vouchers && e.FIELD_VOUCHER_COUPONS_ENABLED === 'true',
  };
}

export const lovableCFlagsProvider: Provider = {
  provide: LOVABLE_C_FLAGS,
  useFactory: (): FlagsLovableC => lerFlagsLovableC(),
};
