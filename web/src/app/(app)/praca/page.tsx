'use client';

import { useState } from 'react';
import { MapPin } from 'lucide-react';
import {
  useActivePraca,
  usePracas,
  useSetActivePraca,
} from '@/modules/pracas/application/use-pracas';
import { AberturaPraca } from '@/components/praca/AberturaPraca';
import { NewPracaForm } from '@/components/praca/NewPracaForm';
import { PlanoAbertura } from '@/components/praca/PlanoAbertura';

/**
 * Plano da praça ativa — a tela de antes do redesenho (continua abrindo até a E7, que a troca pelo detalhe `/pracas/[id]`).
 * O plano em si (faixa de etapas, etapas e ações fixas) é o `PlanoAbertura`, o mesmo do detalhe da praça.
 */
export default function PracaPage() {
  const { praca, isPending: pracasPending } = useActivePraca();
  const { data: pracas } = usePracas();
  const setActivePraca = useSetActivePraca();

  const [showNew, setShowNew] = useState(false);
  const [showAbertura, setShowAbertura] = useState(false);

  return (
    <>
      {/* seletor de praça */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={praca?.id ?? ""}
          onChange={(e) => setActivePraca.mutate(e.target.value)}
          className="rounded-md border border-input bg-card px-3 py-2 font-display text-sm font-bold"
        >
          {(pracas ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button
          onClick={() => setShowAbertura(true)}
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 font-display text-xs font-bold uppercase tracking-wide text-primary-foreground"
        >
          <MapPin size={13} /> Abertura de praça
        </button>
        <button onClick={() => setShowNew(!showNew)} className="tag rounded-md border border-primary px-3 py-2 text-primary">+ Nova praça</button>
      </div>
      {showNew && <div className="mt-3"><NewPracaForm onDone={() => setShowNew(false)} /></div>}
      {showAbertura && <AberturaPraca onClose={() => setShowAbertura(false)} />}

      {pracasPending && <p className="mt-6 text-sm text-muted-foreground">Carregando…</p>}
      {/* Mesma redação das outras 7 telas ("Nenhuma praça ainda — abra a primeira
          em …"); aqui o destino é o botão desta tela, não um link para ela. */}
      {!pracasPending && !praca && (
        <p className="mt-6 text-sm text-muted-foreground">
          Nenhuma praça ainda — abra a primeira em <strong className="font-semibold">Abertura de praça</strong>.
        </p>
      )}

      {praca && (
        <>
          {/* cobertura da praça ativa */}
          {praca.cobertura && (
            <div className="card-surface mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-xs text-muted-foreground">
              <span className="flex items-center gap-1 font-semibold text-foreground"><MapPin size={12} className="text-primary" /> {praca.cobertura.cidade} · {praca.cobertura.uf}</span>
              <span>raio de 50 km · {praca.cobertura.vizinhas.length} cidades em volta</span>
              <span className="truncate">{praca.cobertura.vizinhas.slice(0, 8).join(", ")}{praca.cobertura.vizinhas.length > 8 ? "…" : ""}</span>
            </div>
          )}

          <PlanoAbertura praca={praca} />
        </>
      )}
    </>
  );
}
