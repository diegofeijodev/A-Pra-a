'use client';

import Link from 'next/link';
import { Suspense } from 'react';
import { MapaDeCalor } from '@/components/praca/MapaDeCalor';
import { ROTA } from '@/modules/acesso/domain/enderecos';

/** Mapa de calor (nosso; a Lovable não tem): aberto pelo link do Mapa (UX §4.5), com a volta para ele. */
export default function CalorPage() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">Mapa de calor</h1>
          <p className="text-muted-foreground">Onde a equipe passou, onde fez visitas e onde ainda falta visitar.</p>
        </div>
        <Link href={ROTA.mapa} className="inline-flex min-h-11 items-center text-sm text-primary hover:underline md:min-h-0">
          ← Mapa
        </Link>
      </div>
      {/* `useSearchParams` (filtros na URL) exige Suspense no App Router. */}
      <Suspense fallback={<div aria-busy="true" className="h-48 animate-pulse rounded-2xl bg-muted" />}>
        <MapaDeCalor />
      </Suspense>
    </div>
  );
}
