'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ROTA } from '@/modules/acesso/domain/enderecos';
import { CabecalhoPagina } from '@/components/praca/CabecalhoPagina';
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
        Nenhuma praça ainda — abra a primeira em <Link href={ROTA.pracas} className="text-primary hover:underline">Praças</Link>.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <CabecalhoPagina
        titulo="Campanhas"
        subtitulo="Do briefing ao número que importa: quantos cadastraram, quantos viraram cliente ativo e a que custo."
      />

      <div className="flex w-fit gap-1 rounded-2xl bg-card p-1 shadow-card">
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
    </div>
  );
}
