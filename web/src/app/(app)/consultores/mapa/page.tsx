'use client';

import Link from 'next/link';
import { MapaSituacao } from '@/components/praca/MapaSituacao';
import { ROTA } from '@/modules/acesso/domain/enderecos';

/** Mapa (Lovable `mapa.tsx`, UX §4.5, arquitetura §5 E5.3): página própria; o Mapa de calor é o link à direita do título. */
export default function MapaPage() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">Mapa</h1>
          <p className="text-muted-foreground">Somente praças abertas (em andamento ou concluídas). Cor e símbolo indicam a situação de cada cliente.</p>
        </div>
        <Link href={ROTA.mapaCalor} className="inline-flex min-h-11 items-center text-sm text-primary hover:underline md:min-h-0">
          Mapa de calor
        </Link>
      </div>
      <MapaSituacao />
    </div>
  );
}
