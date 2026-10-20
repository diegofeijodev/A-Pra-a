'use client';

import Link from 'next/link';
import { PagamentosEquipe } from '@/components/praca/PagamentosEquipe';

export default function PagamentosPage() {
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-xl font-extrabold">Pagamentos</h1>
        <Link href="/consultores" className="text-sm text-primary hover:underline">
          ← Consultores
        </Link>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">Pix de segunda: gere a fila da semana fechada, pague no banco e registre aqui com o comprovante.</p>
      <PagamentosEquipe />
    </>
  );
}
