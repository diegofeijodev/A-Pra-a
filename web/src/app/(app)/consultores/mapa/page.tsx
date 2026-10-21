'use client';

import Link from 'next/link';
import { MapaSituacao } from '@/components/praca/MapaSituacao';

export default function MapaSituacaoPage() {
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-xl font-extrabold">Mapa por situação</h1>
        <div className="flex items-center gap-3">
          <Link href="/consultores/calor" className="text-sm text-primary hover:underline">
            Mapa de calor
          </Link>
          <Link href="/consultores" className="text-sm text-primary hover:underline">
            ← Consultores
          </Link>
        </div>
      </div>
      <MapaSituacao />
    </>
  );
}
