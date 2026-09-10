import { Module } from '@nestjs/common';
import { FreelaClient } from './freela-client';

/**
 * Só a porta de saída para o Freela, sem nada em volta.
 *
 * Existe separada do `FreelaModule` para quebrar o ciclo: o `FreelaModule`
 * precisa do `DisparosService` (o público da campanha `EXTERNAL_LIST` é o mesmo
 * do disparo) e o `DisparosModule` precisa do cliente (a porteira do modo
 * `freela`). Com o cliente num módulo folha, o grafo fica
 * `DisparosModule → FreelaClientModule ← FreelaModule → DisparosModule`, sem
 * `forwardRef` — que aqui esconderia erro de boot em vez de resolver.
 */
@Module({
  providers: [FreelaClient],
  exports: [FreelaClient],
})
export class FreelaClientModule {}
