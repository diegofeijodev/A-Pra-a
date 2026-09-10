'use client';

import { useState } from 'react';
import { addDays, todaySp } from '@/lib/dates';
import { useCreatePraca } from '@/modules/pracas/application/use-pracas';

/**
 * Praça sem cidade-sede do IBGE (a `cobertura` fica `null`) — porte de
 * `NewPracaForm` em `.prototype/src/routes/praca.tsx:31-51`. O caminho com
 * mapa é o `AberturaPraca`.
 */
export function NewPracaForm({ onDone }: { onDone: () => void }) {
  const createPraca = useCreatePraca();
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [start, setStart] = useState(todaySp());
  const [end, setEnd] = useState(addDays(todaySp(), 98));
  return (
    <div className="card-surface space-y-3 p-4">
      <div className="grid gap-2 sm:grid-cols-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome da praça (ex.: Savassi)" className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
        <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Cidade · UF" className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
        <label className="text-xs text-muted-foreground">Início<input type="date" value={start} onChange={(e) => { setStart(e.target.value); setEnd(addDays(e.target.value, 98)); }} className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm" /></label>
        <label className="text-xs text-muted-foreground">Previsão de fim<input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm" /></label>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => {
            if (!name.trim()) return;
            createPraca.mutate(
              { name: name.trim(), city: city.trim() || name.trim(), start_date: start, end_date: end },
              { onSuccess: onDone },
            );
          }}
          disabled={createPraca.isPending}
          className="rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
        >Criar praça com as 11 etapas</button>
        <button onClick={onDone} className="rounded-md border border-border px-4 py-2 text-sm text-muted-foreground">Cancelar</button>
      </div>
    </div>
  );
}
