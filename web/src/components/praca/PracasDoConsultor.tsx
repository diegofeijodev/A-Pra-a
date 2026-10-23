'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useSalvarPracasConsultor } from '@/modules/consultores/application/use-consultores';
import type { ConsultorView } from '@/modules/consultores/infrastructure/consultores.api';
import { usePracas } from '@/modules/pracas/application/use-pracas';

/**
 * "Praças em que atua" (lote F2, contrato §44.7, UX §3.8). Só admin e só com `FIELD_MULTI_PRACA_ENABLED` (quem decide é a página).
 * A principal (a do cadastro) fica sempre marcada; as outras entram e saem com um toque. Vale a partir do próximo início do dia
 * dele: a jornada aberta muda na hora só se a praça dela sair.
 */
export function PracasDoConsultor({ consultor }: { consultor: ConsultorView }) {
  const { data: pracas, isPending } = usePracas();
  const salvar = useSalvarPracasConsultor(consultor.id);
  const atuais = consultor.praca_ids ?? [consultor.praca_id];
  const [marcadas, setMarcadas] = useState<string[] | null>(null);
  const sel = marcadas ?? atuais;
  const mudou = sel.length !== atuais.length || sel.some((id) => !atuais.includes(id));
  const alternar = (id: string) => {
    if (id === consultor.praca_id) return;
    setMarcadas(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]);
  };

  return (
    <section className="card-surface mt-6 space-y-3 p-4" aria-labelledby="pracas-do-consultor">
      <div>
        <h2 id="pracas-do-consultor" className="text-base font-bold">
          Praças em que atua
        </h2>
        <p className="text-xs text-muted-foreground">
          A principal ({consultor.praca_name}) fica sempre. No início do dia ele escolhe a praça (sem roteiro) e o campo mostra só os lugares dela. Ganhos e Pix
          continuam listados pela principal.
        </p>
      </div>
      {isPending ? (
        <p className="text-sm text-muted-foreground">Carregando as praças…</p>
      ) : (
        <div role="group" aria-label="Praças em que atua" className="flex flex-wrap gap-2">
          {(pracas ?? []).map((p) => {
            const ativa = sel.includes(p.id);
            const principal = p.id === consultor.praca_id;
            return (
              <button
                key={p.id}
                type="button"
                role="checkbox"
                aria-checked={ativa}
                disabled={principal || salvar.isPending}
                onClick={() => alternar(p.id)}
                className={`flex min-h-12 items-center gap-2 rounded-md border px-3 text-sm ${ativa ? 'border-primary bg-primary/15 font-bold' : 'border-border'} disabled:opacity-70`}
              >
                {ativa && <span aria-hidden>✓</span>}
                <span>
                  {p.name}
                  {principal ? ' (principal)' : ''}
                </span>
              </button>
            );
          })}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => salvar.mutate(sel, { onSuccess: () => setMarcadas(null) })} disabled={!mudou || salvar.isPending} className="h-12">
          {salvar.isPending ? 'Salvando…' : 'Salvar praças'}
        </Button>
        <p className="text-xs text-muted-foreground">
          {sel.length} {sel.length === 1 ? 'praça' : 'praças'} marcadas.
        </p>
      </div>
    </section>
  );
}
