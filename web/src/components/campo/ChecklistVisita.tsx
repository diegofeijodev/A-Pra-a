'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { marcarEtapa, type ChecklistTela, type MarcaChecklist } from '@/modules/campo/domain/checklist';

/**
 * "Roteiro da visita" (checklist de abordagem, contrato §35; UX §3.5 e §4.13.1, Lovable `VisitaAberta`). Cada etapa num quadro
 * com borda, riscada quando feita. Tocar na linha inteira marca a etapa (1 toque, 56 px); [Anotar] abre a observação SÓ daquela
 * etapa ("Objeção principal" na etapa da objeção, como a Lovable). Não é obrigatório por padrão: não acrescenta toque nenhum.
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
  /** Lote C (§38, UX §3.2 entrada (b)): atalho "Pedir voucher" na etapa "Oferecer o cupom". Ausente = sem atalho. */
  aoPedirCupom?: () => void;
}) {
  const [aberto, setAberto] = useState(abertoInicial);
  const [anotando, setAnotando] = useState<string | null>(null);
  const feitas = checklist.items.filter((e) => e.done).length;
  const total = checklist.items.length;
  return (
    <section aria-label="Roteiro da visita" className="card-surface">
      <button
        type="button"
        aria-expanded={aberto}
        onClick={() => setAberto(!aberto)}
        className="flex min-h-14 w-full items-center justify-between gap-3 px-4 text-left text-base font-bold"
      >
        <span>
          Roteiro da visita · {feitas} de {total}
        </span>
        <span aria-hidden>{aberto ? '▴' : '▾'}</span>
      </button>
      {aberto && (
        <ol className="space-y-2 border-t border-border p-2">
          {checklist.items.map((e, i) => (
            <li key={e.id} className="space-y-2 rounded-lg border border-border p-2">
              {/* `flex-wrap` + base de 12rem: no celular, quando o texto e os botões não cabem numa linha (etapa do voucher), os botões
                  descem para a linha de baixo, à direita, em vez de espremer o texto e encostar "Anotar" na borda. */}
              <div className="flex flex-wrap items-center gap-x-2">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={e.done}
                  disabled={desabilitado}
                  onClick={() => onMarcas(marcarEtapa(checklist, e.id, { done: !e.done }))}
                  className="flex min-h-14 min-w-0 flex-1 basis-48 items-center gap-3 px-2 text-left text-sm disabled:opacity-50"
                >
                  <span
                    aria-hidden
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded border-2 text-xs font-black ${
                      e.done ? 'border-primary bg-primary text-primary-foreground' : 'border-foreground/60'
                    }`}
                  >
                    {e.done ? '✓' : ''}
                  </span>
                  <span className={`min-w-0 break-words ${e.done ? 'text-muted-foreground line-through' : ''}`}>
                    {i + 1}. {e.text}
                  </span>
                </button>
                <div className="ml-auto flex shrink-0 items-center gap-1 pr-1">
                {aoPedirCupom && e.id === 'oferecer_cupom' && (
                  <button
                    type="button"
                    disabled={desabilitado}
                    onClick={aoPedirCupom}
                    className="min-h-12 shrink-0 px-2 text-sm font-bold text-foreground underline underline-offset-4 disabled:opacity-50"
                  >
                    <span aria-hidden>🎟 </span>Pedir voucher
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
              </div>
              {(anotando === e.id || !!e.note) && (
                <Input
                  aria-label={`Observação da etapa ${i + 1}`}
                  placeholder={/obje/i.test(e.text) ? 'Objeção principal' : 'Observação (opcional)'}
                  maxLength={200}
                  disabled={desabilitado}
                  value={e.note ?? ''}
                  onChange={(ev) => onMarcas(marcarEtapa(checklist, e.id, { note: ev.target.value || null }))}
                  className="h-11 text-sm"
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
