'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { ListaClientes } from '@/components/praca/ListaClientes';
import { MapaSituacao } from '@/components/praca/MapaSituacao';
import { useFeaturesLovable, useConfigLovable } from '@/modules/painel/application/use-painel';

const aba = (ativa: boolean) =>
  `flex h-12 items-center rounded-md border px-4 text-sm font-bold ${ativa ? 'border-primary bg-primary/15 text-foreground' : 'border-border text-muted-foreground hover:text-foreground'}`;

/**
 * Operação > Clientes (UX §3.3): Lista | Mapa | Mapa de calor. Abre em Lista; "Mapa" do menu abre a mesma página em Mapa
 * (`?modo=mapa`). O "Mapa de calor" é a tela de sempre (`/consultores/calor`). Só com FIELD_MAP_PINS_ENABLED.
 */
function Clientes() {
  const router = useRouter();
  const busca = useSearchParams();
  const modo = busca.get('modo') === 'mapa' ? 'mapa' : 'lista';
  const cfg = useConfigLovable();
  const features = useFeaturesLovable();

  return (
    <>
      <h1 className="font-display text-xl font-extrabold">Clientes</h1>
      {cfg.isPending ? (
        <div aria-busy="true" className="mt-4 h-40 animate-pulse rounded-lg bg-muted" />
      ) : !features.map_pins ? (
        <p className="card-surface mt-4 p-4 text-sm">Este recurso ainda não está ligado neste servidor.</p>
      ) : (
        <>
          <div role="tablist" aria-label="Clientes" className="mt-3 flex flex-wrap gap-2">
            <button type="button" role="tab" aria-selected={modo === 'lista'} className={aba(modo === 'lista')} onClick={() => router.replace('/consultores/clientes')}>
              Lista
            </button>
            <button type="button" role="tab" aria-selected={modo === 'mapa'} className={aba(modo === 'mapa')} onClick={() => router.replace('/consultores/clientes?modo=mapa')}>
              Mapa
            </button>
            <Link href="/consultores/calor" role="tab" aria-selected={false} className={aba(false)}>
              Mapa de calor
            </Link>
          </div>
          {modo === 'mapa' ? <MapaSituacao /> : <ListaClientes />}
        </>
      )}
    </>
  );
}

export default function ClientesPage() {
  return (
    <Suspense fallback={<div aria-busy="true" className="mt-4 h-40 animate-pulse rounded-lg bg-muted" />}>
      <Clientes />
    </Suspense>
  );
}
