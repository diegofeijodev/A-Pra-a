'use client';

import { BuscaEstabelecimentos } from '@/components/praca/BuscaEstabelecimentos';
import { useActivePraca } from '@/modules/pracas/application/use-pracas';

export default function ProspeccaoPage() {
  const { praca, isPending } = useActivePraca();
  return (
    <>
      <h1 className="font-display text-xl font-extrabold">Buscar estabelecimentos</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Encontre bares e restaurantes numa região e escolha quais viram leads.
      </p>
      {isPending ? (
        <p className="mt-4 text-sm text-muted-foreground">Carregando…</p>
      ) : !praca ? (
        <p className="mt-4 text-sm text-muted-foreground">Nenhuma praça ainda. Crie uma em Praça para buscar estabelecimentos.</p>
      ) : (
        <BuscaEstabelecimentos praca={praca} />
      )}
    </>
  );
}
