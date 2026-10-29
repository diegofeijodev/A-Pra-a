'use client';

import type { ReactNode } from 'react';
import { useActivePraca, usePracas, useSetActivePraca } from '@/modules/pracas/application/use-pracas';

/**
 * Cabeçalho comum das telas do Comercial (UX §3.7): título, subtítulo, seletor de
 * praça (opcional) e ações. Sem o rótulo `tag` em cima do título (achado 28).
 * No celular: título, depois o seletor na largura toda, depois as ações.
 */
export function CabecalhoPagina({
  titulo,
  subtitulo,
  comPraca = false,
  acoes,
}: {
  titulo: string;
  subtitulo?: ReactNode;
  comPraca?: boolean;
  acoes?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-3xl font-semibold">{titulo}</h1>
        {subtitulo ? <p className="text-muted-foreground">{subtitulo}</p> : null}
      </div>
      {comPraca || acoes ? (
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          {comPraca ? <SeletorPraca /> : null}
          {acoes}
        </div>
      ) : null}
    </div>
  );
}

/** A praça ativa vale para todo o Comercial (achado 18): trocar aqui grava em `active_praca_id`. */
function SeletorPraca() {
  const { praca } = useActivePraca();
  const { data: pracas } = usePracas();
  const trocar = useSetActivePraca();
  return (
    <>
      <label htmlFor="praca-ativa" className="sr-only">
        Praça
      </label>
      <select
        id="praca-ativa"
        value={praca?.id ?? ''}
        aria-busy={trocar.isPending}
        onChange={(e) => trocar.mutate(e.target.value)}
        className="h-11 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm sm:min-w-48 sm:flex-none md:h-9"
      >
        {(pracas ?? []).map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </>
  );
}
