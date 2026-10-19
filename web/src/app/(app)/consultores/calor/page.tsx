'use client';

import Link from 'next/link';
import { Suspense } from 'react';
import { MapaDeCalor } from '@/components/praca/MapaDeCalor';

export default function CalorPage() {
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-xl font-extrabold">Mapa de calor</h1>
        <Link href="/consultores" className="text-sm text-primary hover:underline">
          ← Consultores
        </Link>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">Onde a equipe passou, onde fez visitas e onde ainda falta visitar.</p>
      {/* `useSearchParams` (filtros na URL) exige Suspense no App Router. */}
      <Suspense fallback={<p className="mt-4 text-sm text-muted-foreground">Carregando…</p>}>
        <MapaDeCalor />
      </Suspense>
    </>
  );
}
