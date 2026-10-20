'use client';

import { CONFIG_VISITA_PADRAO, type ConfigVisita, type FluxoVisita } from '../domain/fluxo';
import { useCampoMe } from './use-campo';

/**
 * Fluxo da visita que a tela mostra (contrato §31.4): vem do `/me` (retrato guardado no aparelho, então vale sem sinal).
 * Sem o campo (flag desligada, resposta antiga) é `completo`: as telas de hoje, sem mudança.
 */
export function useFluxo(): { fluxo: FluxoVisita; config: ConfigVisita; ligado: boolean; pronto: boolean } {
  const me = useCampoMe();
  const ligado = me.data?.features?.visit_flow === true;
  return {
    fluxo: ligado && me.data?.visit_flow === 'simples' ? 'simples' : 'completo',
    config: me.data?.visit_config ?? CONFIG_VISITA_PADRAO,
    ligado,
    pronto: !!me.data,
  };
}
