'use client';

import { checklistDaTela, type ChecklistTela, type ChecklistVisitaView } from '../domain/checklist';
import type { VisitAnswers } from '../domain/campo.types';
import type { FluxoVisita } from '../domain/fluxo';
import { useCampoMe } from './use-campo';

/**
 * Checklist da visita na tela (contrato §35.6): flag pelo `features` do `/me` guardado (vale sem sinal), lista da foto do servidor
 * ou, com o check-in ainda na fila, da configuração guardada; marcas do rascunho por cima.
 */
export function useChecklist(p: { flow: FluxoVisita; naServidor: boolean; foto: ChecklistVisitaView | null | undefined; respostas: VisitAnswers }): {
  ligado: boolean;
  checklist: ChecklistTela | null;
  abertoInicial: boolean;
} {
  const me = useCampoMe();
  const ligado = me.data?.features?.checklist === true;
  const config = me.data?.checklist_config ?? null;
  return {
    ligado,
    checklist: checklistDaTela({ ligado, flow: p.flow, naServidor: p.naServidor, foto: p.foto ?? null, config, marcas: p.respostas.checklist ?? null }),
    abertoInicial: config?.aberto ?? true,
  };
}
