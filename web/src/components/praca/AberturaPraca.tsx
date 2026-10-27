'use client';

import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import { MapPin, Rocket, X } from 'lucide-react';
import { addDays, todaySp } from '@/lib/dates';
import { fmtPop, RADIUS_KM, UF_NOME } from '@/lib/geo';
import { useEstados, useMunicipios, useVizinhas } from '@/modules/geo/application/use-geo';
import { useCreatePraca, useSetActivePraca } from '@/modules/pracas/application/use-pracas';

// O Leaflet só existe no navegador — o mapa entra por import dinâmico.
const AberturaMapa = dynamic(() => import('./AberturaMapa'), { ssr: false });

/**
 * Abertura de praça — porte de `.prototype/src/components/praca/AberturaPraca.tsx`.
 *
 * Desvio §9.11: os 500 KB do IBGE saíram do navegador. Estado, cidades e o
 * cálculo do raio vêm de `/v1/geo` (§5); no `POST /v1/pracas` mandamos só
 * `{ibge, km}` e o servidor resolve UF, lat/lon e vizinhas — o cliente não
 * dita cobertura.
 */
export function AberturaPraca({ onClose }: { onClose: () => void }) {
  const [uf, setUf] = useState("");
  const [cidadeId, setCidadeId] = useState("");
  const [busca, setBusca] = useState("");

  const { data: estados } = useEstados();
  const { data: cidadesUf } = useMunicipios(uf);
  const { data: cobertura } = useVizinhas(cidadeId, RADIUS_KM);
  const createPraca = useCreatePraca();
  const setActivePraca = useSetActivePraca();

  // A API já devolve as cidades da UF ordenadas por nome (§5).
  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const todas = cidadesUf ?? [];
    return q ? todas.filter((m) => m.nome.toLowerCase().includes(q)) : todas;
  }, [cidadesUf, busca]);

  const centro = cidadesUf?.find((m) => m.ibge === cidadeId) ?? null;
  const vizinhas = cobertura?.vizinhas ?? [];
  const popTotal = cobertura?.pop_total ?? 0;

  const criar = () => {
    if (!centro) return;
    const start = todaySp();
    createPraca.mutate(
      {
        name: centro.nome,
        city: `${centro.nome} · ${centro.uf}`,
        start_date: start,
        end_date: addDays(start, 98),
        cobertura: { ibge: centro.ibge, km: RADIUS_KM },
      },
      {
        onSuccess: (praca) => {
          // O servidor já grava `active_praca_id` de quem criou; repetir aqui
          // garante o shell apontando para a praça nova mesmo se a releitura
          // da sessão falhar.
          setActivePraca.mutate(praca.id);
          onClose();
        },
      },
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-6" onClick={onClose}>
      <div
        className="flex max-h-[94vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-xl border border-border bg-card sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <MapPin size={16} className="text-primary" />
            <h2 className="font-display text-base font-extrabold">Abertura de praça</h2>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary"><X size={16} /></button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {/* estado → cidade */}
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-xs text-muted-foreground">
              Estado
              <select
                value={uf}
                onChange={(e) => { setUf(e.target.value); setCidadeId(""); setBusca(""); }}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
              >
                <option value="">Selecione o estado…</option>
                {(estados ?? []).map((u) => <option key={u} value={u}>{UF_NOME[u]} ({u})</option>)}
              </select>
            </label>
            <label className="text-xs text-muted-foreground">
              Cidade-sede da praça
              <select
                value={cidadeId}
                onChange={(e) => setCidadeId(e.target.value)}
                disabled={!uf}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary disabled:opacity-50"
              >
                <option value="">{uf ? "Selecione a cidade…" : "Escolha o estado primeiro"}</option>
                {filtradas.map((m) => (
                  <option key={m.ibge} value={m.ibge}>{m.nome} — {fmtPop(m.pop)} hab</option>
                ))}
              </select>
            </label>
          </div>
          {uf && (
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar cidade pelo nome…"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          )}

          {/* mapa + vizinhas */}
          {centro && cobertura ? (
            <>
              <AberturaMapa centro={cobertura.centro} vizinhas={vizinhas} dark={false} />
              <div className="rounded-md border border-border bg-secondary/40 p-3">
                <p className="tag text-muted-foreground">Cobertura no raio de {RADIUS_KM} km</p>
                <p className="mt-1 text-sm">
                  <strong className="font-display">{centro.nome}</strong> puxa{" "}
                  <strong className="font-display">{vizinhas.length}</strong>{" "}
                  {vizinhas.length === 1 ? "cidade em volta" : "cidades em volta"} — área com{" "}
                  <strong className="font-display text-primary">{fmtPop(popTotal)} habitantes</strong>.
                </p>
                <div className="mt-2 flex max-h-28 flex-wrap gap-1 overflow-y-auto">
                  {vizinhas.slice(0, 40).map((m) => (
                    <span key={m.ibge} className="tag rounded-sm border border-border bg-background px-1.5 py-0.5 text-muted-foreground" title={`${m.pop.toLocaleString("pt-BR")} hab · ${m.km.toFixed(0)} km`}>
                      {m.nome} <span className="text-primary/70">{m.km.toFixed(0)}km</span>
                    </span>
                  ))}
                  {vizinhas.length > 40 && <span className="tag px-1.5 py-0.5 text-muted-foreground">+{vizinhas.length - 40}</span>}
                </div>
              </div>
            </>
          ) : (
            <div className="flex h-40 items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground">
              {/* Mesma condição do protótipo: "carregando" é sobre a BASE de
                  cidades, não sobre a cobertura de uma cidade já escolhida. */}
              {!estados ? "Carregando base de cidades…" : "Escolha o estado e a cidade para ver o mapa"}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-3">
          <p className="text-[11px] text-muted-foreground">A praça nasce com as 11 etapas do roteiro.</p>
          <button
            onClick={criar}
            disabled={!centro || createPraca.isPending}
            className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-40"
          >
            <Rocket size={14} /> Criar praça{centro ? ` em ${centro.nome}` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
