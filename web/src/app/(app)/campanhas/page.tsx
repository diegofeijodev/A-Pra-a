'use client';

import Link from 'next/link';
import { useState } from 'react';
import { CampCalendario } from '@/components/praca/CampCalendario';
import { CampCriativos } from '@/components/praca/CampCriativos';
import { CampEstrategia } from '@/components/praca/CampEstrategia';
import { CampTrafego } from '@/components/praca/CampTrafego';
import { useActivePraca } from '@/modules/pracas/application/use-pracas';

const TABS = ["estratégia", "criativos", "tráfego", "calendário"] as const;

/**
 * Campanhas — porte de `.prototype/src/routes/campanhas.tsx`.
 *
 * O `<LeadPanel/>` que a rota do protótipo montava vive no layout de `(app)`,
 * então a página não o monta de novo. Como no Funil, a tela espera a lista de
 * praças chegar antes de decidir entre "carregando" e "nenhuma praça ainda":
 * campanha, prova e freio de preenchimento são todos por praça.
 */
export default function CampanhasPage() {
  const { praca, isPending: pracasPending } = useActivePraca();
  const [tab, setTab] = useState<(typeof TABS)[number]>("estratégia");
  const [campanhaId, setCampanhaId] = useState("");

  if (pracasPending) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  if (!praca) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhuma praça ainda — abra a primeira em <Link href="/praca" className="text-primary hover:underline">Praça</Link>.
      </p>
    );
  }

  return (
    <>
      <div>
        <p className="tag text-muted-foreground">Mídia</p>
        <h1 className="font-display text-2xl font-black tracking-tight">Campanhas</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Do briefing ao número que importa: quantos cadastraram, quantos viraram cliente ativo e a que custo.
        </p>
      </div>

      <div className="mt-4 flex w-fit gap-1 rounded-lg border border-border bg-card/60 p-1">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-md px-4 py-1.5 text-sm font-bold capitalize ${tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "estratégia" && <CampEstrategia onOpen={(id: string) => { setCampanhaId(id); setTab("criativos"); }} />}
      {tab === "criativos" && <CampCriativos campanhaId={campanhaId} setCampanhaId={setCampanhaId} />}
      {tab === "tráfego" && <CampTrafego />}
      {tab === "calendário" && <CampCalendario />}
    </>
  );
}
