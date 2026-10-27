'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';
import { ListaClientes } from '@/components/praca/ListaClientes';
import { ROTA } from '@/modules/acesso/domain/enderecos';
import { useConfigLovable, useFeaturesLovable } from '@/modules/painel/application/use-painel';

/**
 * Clientes (Lovable `clientes.tsx`, UX §4.4, arquitetura §5 E5.3): só a lista. O Mapa virou página própria (`ROTA.mapa`) e o Mapa de
 * calor é um link dentro dele. O endereço antigo do Mapa (`?modo=mapa`, o do menu até a E5) continua abrindo: leva à página do Mapa.
 * Só com FIELD_MAP_PINS_ENABLED.
 */
function Clientes() {
  const router = useRouter();
  const mapaAntigo = useSearchParams().get('modo') === 'mapa';
  const cfg = useConfigLovable();
  const features = useFeaturesLovable();

  useEffect(() => {
    if (mapaAntigo) router.replace(ROTA.mapa);
  }, [mapaAntigo, router]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-semibold">Clientes</h1>
        <p className="text-muted-foreground">Clientes já visitados aparecem aqui com o resultado da visita.</p>
      </div>
      {cfg.isPending || mapaAntigo ? (
        <div aria-busy="true" className="h-48 animate-pulse rounded-2xl bg-muted" />
      ) : !features.map_pins ? (
        <p className="rounded-2xl bg-card p-5 text-sm shadow-card">Este recurso ainda não está ligado neste servidor.</p>
      ) : (
        <ListaClientes />
      )}
    </div>
  );
}

export default function ClientesPage() {
  return (
    <Suspense fallback={<div aria-busy="true" className="h-48 animate-pulse rounded-2xl bg-muted" />}>
      <Clientes />
    </Suspense>
  );
}
