import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  type ThrottlerModuleOptions,
  type ThrottlerRequest,
  type ThrottlerStorage,
} from '@nestjs/throttler';
import { PUBLIC_LEADS_THROTTLE_KEY } from '../decorators/public-leads-throttle.decorator';

/**
 * O `ThrottlerGuard` global, com um limite configurável por ambiente.
 *
 * O formulário público (`POST /v1/public/leads`) é o único ponto que qualquer
 * visitante da internet escreve sem login, então tem teto próprio, apertado em
 * produção (10/min) e folgado em desenvolvimento — `PUBLIC_LEADS_PER_MINUTE`.
 * Como decorator é estático, o número não pode viver no `@Throttle`: o guard
 * troca o limite da rota marcada com `@PublicLeadsThrottle()` na hora do
 * request. É subclasse do guard GLOBAL (e não um segundo guard na rota) de
 * propósito: dois guards contariam o mesmo request duas vezes no mesmo balde.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storageService: ThrottlerStorage,
    reflector: Reflector,
    private readonly config: ConfigService,
  ) {
    super(options, storageService, reflector);
  }

  protected async handleRequest(requestProps: ThrottlerRequest): Promise<boolean> {
    const doFormulario = this.reflector.getAllAndOverride<boolean>(PUBLIC_LEADS_THROTTLE_KEY, [
      requestProps.context.getHandler(),
      requestProps.context.getClass(),
    ]);
    if (!doFormulario) return super.handleRequest(requestProps);

    // `Number` na saída do ConfigService: se a variável vier crua do ambiente
    // (string "60"), comparar texto com número deixaria o teto sem sentido.
    // Sem variável válida, vale o que está no `@Throttle` da rota (produção: 10).
    const limite = Number(this.config.get('PUBLIC_LEADS_PER_MINUTE'));
    const valido = Number.isInteger(limite) && limite > 0;
    return super.handleRequest(valido ? { ...requestProps, limit: limite } : requestProps);
  }
}
