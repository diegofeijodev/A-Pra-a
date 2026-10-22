'use client';

import { toast } from 'sonner';
import { useCampoSession } from './campo-session.store';
import { useCampoMe } from './use-campo';
import { desfazerInicioDoIntervalo, enfileirar } from './use-fila';
import { useFluxo } from './use-fluxo';
import { duracaoMin, hora } from '../domain/formatos';
import type { IntervaloLocal } from '../domain/dia-local';

/**
 * Intervalo da jornada no aparelho (lote B, contrato §37; UX §3.6): 1 toque para começar (com "Desfazer" de alguns segundos) e 1
 * para voltar, pela fila (vale sem sinal). Só com `features.breaks` e `intervalo_ativo`; a localização pausa durante o intervalo.
 */
export function useIntervalo() {
  const me = useCampoMe();
  const { config } = useFluxo();
  const consultantId = useCampoSession((s) => s.session?.consultant.id ?? '');
  const ligado = me.data?.features?.breaks === true && (me.data?.breaks_config?.intervalo_ativo ?? true);
  const lembreteMin = me.data?.breaks_config?.intervalo_lembrete_min ?? 60;

  async function iniciar(): Promise<void> {
    const client_id = crypto.randomUUID();
    const seg = config.desfazer_segundos;
    await enfileirar({ kind: 'break_start', payload: { client_id, at: new Date().toISOString() } }, consultantId, seg > 0 ? { segurarMs: seg * 1000 } : {});
    if (seg > 0) {
      toast('Intervalo iniciado. A localização fica pausada.', {
        duration: seg * 1000,
        action: {
          label: 'Desfazer',
          onClick: () => void desfazerInicioDoIntervalo(client_id, consultantId).then((ok) => (ok ? undefined : toast('O intervalo já foi enviado.'))),
        },
      });
    } else toast.success('Intervalo iniciado. A localização fica pausada.');
  }

  async function voltar(aberto: IntervaloLocal): Promise<void> {
    const at = new Date().toISOString();
    await enfileirar({ kind: 'break_end', payload: { client_id: crypto.randomUUID(), at } }, consultantId);
    toast.success(`Intervalo encerrado às ${hora(at)} (${duracaoMin(aberto.started_at, at) ?? 0} min).`);
  }

  return { ligado, lembreteMin, iniciar, voltar };
}
