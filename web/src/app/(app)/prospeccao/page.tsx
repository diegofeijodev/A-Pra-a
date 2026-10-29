'use client';

import { CabecalhoPagina } from '@/components/praca/CabecalhoPagina';
import { BuscaEstabelecimentos } from '@/components/praca/BuscaEstabelecimentos';
import { useActivePraca } from '@/modules/pracas/application/use-pracas';

export default function ProspeccaoPage() {
  const { praca, isPending } = useActivePraca();
  return (
    <div className="space-y-6">
      <CabecalhoPagina
        titulo="Buscar estabelecimentos"
        subtitulo="Encontre bares e restaurantes numa região e escolha quais viram leads."
      />
      {isPending ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : !praca ? (
        <p className="text-sm text-muted-foreground">Nenhuma praça ainda. Crie uma em Praça para buscar estabelecimentos.</p>
      ) : (
        <BuscaEstabelecimentos praca={praca} />
      )}
    </div>
  );
}
