'use client';

import Link from 'next/link';
import { RoteirosEquipe } from '@/components/praca/RoteirosEquipe';
import { useActivePraca } from '@/modules/pracas/application/use-pracas';

export default function RoteirosPage() {
  const { praca, isPending } = useActivePraca();
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-xl font-extrabold">Roteiros do dia</h1>
        <Link href="/consultores" className="text-sm text-primary hover:underline">
          ← Consultores
        </Link>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">Monte o dia de cada consultor e acompanhe o planejado × realizado.</p>
      {isPending ? (
        <p className="mt-4 text-sm text-muted-foreground">Carregando…</p>
      ) : !praca ? (
        <p className="mt-4 text-sm text-muted-foreground">Nenhuma praça ainda. Crie uma em Praça para montar roteiros.</p>
      ) : (
        <RoteirosEquipe praca={praca} />
      )}
    </>
  );
}
