'use client';

import { useState } from 'react';
import { addDays, todaySp } from '@/lib/dates';
import { useCatalog } from '@/modules/catalog/application/use-catalog';
import { useMoveLead } from '@/modules/leads/application/use-leads';

/**
 * Mudança de etapa — porte de
 * `.prototype/src/components/praca/MoveLeadDialog.tsx`.
 *
 * Desvio §9.3: sem seletor de autor (o servidor carimba pelo token). O nome do
 * lead vem por propriedade em vez de um `s.lead(leadId)` — quem abre o diálogo
 * (o quadro ou o painel) já tem o lead na mão, e buscar de novo só faria o
 * diálogo piscar vazio enquanto o GET não volta.
 */
export function MoveLeadDialog({
  leadId,
  leadName,
  to,
  onClose,
}: {
  leadId: string;
  leadName: string;
  to: number;
  onClose: () => void;
}) {
  const { data: catalog } = useCatalog();
  const move = useMoveLead();
  const [what, setWhat] = useState("");
  const [date, setDate] = useState(addDays(todaySp(), 2));
  const [reason, setReason] = useState<string>("");
  const [freeReason, setFreeReason] = useState("");

  const lostReasons = catalog?.lost_reasons ?? [];
  const def = catalog?.funnel_stages.find((s) => s.n === to);
  const lost = to === 8;
  const chosen = reason || lostReasons[0] || "";
  // "outro" grava o TEXTO DIGITADO como motivo da perda: o `lost_reason` da API
  // é texto livre de 1 a 120 caracteres e o catálogo é só a lista sugerida (§9).
  const finalReason = chosen === "outro" ? freeReason.trim() : chosen;
  const ok = lost ? finalReason.length > 0 : what.trim().length > 0;

  const confirm = () => {
    if (!ok) return;
    move.mutate(
      {
        id: leadId,
        input: lost
          ? { stage: to, lost_reason: finalReason }
          : { stage: to, next_step: { what: what.trim(), date } },
      },
      { onSuccess: () => onClose() },
    );
  };

  return (
    <div className="no-print fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-border bg-popover p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <p className="tag text-muted-foreground">Mudança de etapa</p>
        <h3 className="mt-1 font-display text-base font-extrabold">
          {leadName} → <span style={{ color: def?.color }}>{to}. {def?.name}</span>
        </h3>

        {lost ? (
          <div className="mt-4">
            <p className="text-xs text-muted-foreground">Motivo da perda (obrigatório)</p>
            <div className="mt-2 space-y-1.5">
              {lostReasons.map((r) => (
                <label key={r} className="flex items-center gap-2 text-sm">
                  <input type="radio" checked={chosen === r} onChange={() => setReason(r)} /> {r}
                </label>
              ))}
            </div>
            {chosen === "outro" && (
              <input
                value={freeReason}
                onChange={(e) => setFreeReason(e.target.value)}
                placeholder="Descreva o motivo"
                maxLength={120}
                className="mt-2 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
              />
            )}
            <p className="mt-2 text-[11px] text-muted-foreground">
              Se o motivo for “não respondeu”, o lead volta para reaquecer em 30 dias.
            </p>
          </div>
        ) : (
          <div className="mt-4">
            <p className="text-xs text-muted-foreground">Próximo passo (obrigatório)</p>
            <input
              value={what}
              onChange={(e) => setWhat(e.target.value)}
              placeholder="Ex.: ligar para o gerente na quinta"
              className="mt-2 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
            />
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-2 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            />
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground">Cancelar</button>
          <button
            onClick={confirm}
            disabled={!ok || move.isPending}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-bold text-primary-foreground disabled:opacity-40"
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}
