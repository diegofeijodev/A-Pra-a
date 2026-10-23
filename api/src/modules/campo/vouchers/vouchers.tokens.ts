import type { Provider } from '@nestjs/common';
import type { CorpoCupomFreela, CupomFreela } from '../../../domain/voucher-rules';
import { FreelaClient } from '../../freela/freela-client';
import { LOVABLE_C_FLAGS, type FlagsLovableC } from '../../rotas/rotas.tokens';

export interface ContratanteCandidato {
  user_id: string;
  name: string;
  city: string | null;
}

/**
 * Porta do cupom real (contrato §38.7). Com `FIELD_VOUCHER_COUPONS_ENABLED` desligada entra o `NoopIssuer`: o pedido aprovado
 * é só registro e **nenhuma** chamada sai para o Freela.
 */
export interface VoucherCouponIssuer {
  /** `false` = Noop (a flag do cupom desligada). */
  readonly ativo: boolean;
  configurado(): boolean;
  criar(corpo: CorpoCupomFreela): Promise<CupomFreela>;
  listar(): Promise<CupomFreela[]>;
  desativar(couponId: string): Promise<CupomFreela>;
  /** Busca do CRM do Freela, só `bars-restaurants`. */
  contratantes(q: string): Promise<ContratanteCandidato[]>;
}

export const VOUCHER_COUPON_ISSUER = Symbol('VOUCHER_COUPON_ISSUER');

const nunca = (): never => {
  throw new Error(
    'NoopIssuer: o cupom no Freela está desligado neste servidor (FIELD_VOUCHER_COUPONS_ENABLED).',
  );
};

export class NoopIssuer implements VoucherCouponIssuer {
  readonly ativo = false;
  configurado(): boolean {
    return false;
  }
  criar(): Promise<CupomFreela> {
    return nunca();
  }
  listar(): Promise<CupomFreela[]> {
    return nunca();
  }
  desativar(): Promise<CupomFreela> {
    return nunca();
  }
  contratantes(): Promise<ContratanteCandidato[]> {
    return nunca();
  }
}

/** O Freela de verdade, pelo `FreelaClient` (zod na resposta; erros do cliente sobem como estão). */
export class FreelaCouponIssuer implements VoucherCouponIssuer {
  readonly ativo = true;
  constructor(private readonly client: FreelaClient) {}
  configurado(): boolean {
    return this.client.isConfigured();
  }
  criar(corpo: CorpoCupomFreela): Promise<CupomFreela> {
    return this.client.createCoupon(corpo);
  }
  listar(): Promise<CupomFreela[]> {
    return this.client.listCoupons();
  }
  desativar(couponId: string): Promise<CupomFreela> {
    return this.client.updateCoupon(couponId, { active: false });
  }
  async contratantes(q: string): Promise<ContratanteCandidato[]> {
    const lista = await this.client.searchContractors(q);
    return lista
      .filter((c) => c.module === 'bars-restaurants')
      .map((c) => ({ user_id: c.userId, name: c.name, city: c.city }));
  }
}

export const voucherIssuerProvider: Provider = {
  provide: VOUCHER_COUPON_ISSUER,
  inject: [FreelaClient, LOVABLE_C_FLAGS],
  useFactory: (client: FreelaClient, flags: FlagsLovableC): VoucherCouponIssuer =>
    flags.voucher_coupons ? new FreelaCouponIssuer(client) : new NoopIssuer(),
};
