'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { marcarEtapa, type ChecklistTela, type MarcaChecklist } from '@/modules/campo/domain/checklist';

/**
 * "Roteiro da conversa" (checklist de abordagem, contrato §35; UX §3.5). Tocar na linha inteira marca a etapa (1 toque, 56 px);
 * [Anotar] abre a observação SÓ daquela etapa. Não é obrigatório por padrão (como a Lovable): não acrescenta toque nenhum.
 */
export function ChecklistVisita({
  checklist,
  abertoInicial,
  desabilitado,
  onMarcas,
  aoPedirCupom,
}: {
  checklist: ChecklistTela;
  abertoInicial: boolean;
  desabilitado?: boolean;
  onMarcas: (m: MarcaChecklist[]) => void;
  /** Lote C (§38, UX §3.2 entrada (b)): atalho "Pedir cupom" na etapa "Oferecer o cupom". Ausente = sem atalho. */
  aoPedirCupom?: () => void;
}) {
  const [aberto, setAberto] = useState(abertoInicial);
  const [anotando, setAnotando] = useState<string | null>(null);
  const feitas = checklist.items.filter((e) => e.done).length;
  const total = checklist.items.length;
  return (
    <section aria-label="Roteiro da conversa" className="card-surface">
      <button
        type="button"
        aria-expanded={aberto}
        onClick={() => setAberto(!aberto)}
        className="flex min-h-14 w-full items-center justify-between gap-3 px-4 text-left text-base font-bold"
      >
        <span>
          Roteiro da conversa · {feitas} de {total}
        </span>
        <span aria-hidden>{aberto ? '▴' : '▾'}</span>
      </button>
      {aberto && (
        <ol className="divide-y divide-border border-t border-border">
          {checklist.items.map((e, i) => (
            <li key={e.id} className="space-y-2 px-2 py-1">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={e.done}
                  disabled={desabilitado}
                  onClick={() => onMarcas(marcarEtapa(checklist, e.id, { done: !e.done }))}
                  className="flex min-h-14 flex-1 items-center gap-3 px-2 text-left text-sm disabled:opacity-50"
                >
                  <span
                    aria-hidden
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded border-2 text-xs font-black ${
                      e.done ? 'border-primary bg-primary text-primary-foreground' : 'border-foreground/60'
                    }`}
                  >
                    {e.done ? '✓' : ''}
                  </span>
                  <span>
                    {i + 1}. {e.text}
                  </span>
                </button>
                {aoPedirCupom && e.id === 'oferecer_cupom' && (
                  <button
                    type="button"
                    disabled={desabilitado}
                    onClick={aoPedirCupom}
                    className="min-h-12 shrink-0 px-2 text-sm font-bold text-foreground underline underline-offset-4 disabled:opacity-50"
                  >
                    <span aria-hidden>🎟 </span>Pedir cupom
                  </button>
                )}
                <button
                  type="button"
                  aria-expanded={anotando === e.id}
                  aria-label={`Anotar na etapa ${i + 1}`}
                  disabled={desabilitado}
                  onClick={() => setAnotando(anotando === e.id ? null : e.id)}
                  className="min-h-12 shrink-0 px-2 text-sm font-bold text-foreground underline underline-offset-4 disabled:opacity-50"
                >
                  Anotar
                </button>
              </div>
              {(anotando === e.id || !!e.note) && (
                <Input
                  aria-label={`Observação da etapa ${i + 1}`}
                  placeholder="Observação (opcional)"
                  maxLength={200}
                  disabled={desabilitado}
                  value={e.note ?? ''}
                  onChange={(ev) => onMarcas(marcarEtapa(checklist, e.id, { note: ev.target.value || null }))}
                  className="h-12"
                />
              )}
            </li>
          ))}
        </ol>
      )}
      {checklist.required === 'todas' && (
        <p className="border-t border-border px-4 py-3 text-sm text-muted-foreground">Todas as etapas precisam ser marcadas para concluir a visita.</p>
      )}
    </section>
  );
}
