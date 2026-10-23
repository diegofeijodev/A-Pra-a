import { Global, Module, type Provider } from '@nestjs/common';
import { lerMultiPraca, MULTI_PRACA_LIGADO } from '../flags/multi-praca.flags';
import { PracasDoConsultorService } from './pracas-do-consultor.service';

export const multiPracaProvider: Provider = { provide: MULTI_PRACA_LIGADO, useFactory: (): boolean => lerMultiPraca() };

/** Lote F2 (contrato §44): a flag e o serviço do conjunto de praças do consultor, para o guard e para todos os módulos. */
@Global()
@Module({ providers: [multiPracaProvider, PracasDoConsultorService], exports: [MULTI_PRACA_LIGADO, PracasDoConsultorService] })
export class PracasDoConsultorModule {}
