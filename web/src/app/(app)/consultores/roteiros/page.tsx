'use client';

import Link from 'next/link';
import { useState } from 'react';
import { DividirRotas } from '@/components/praca/DividirRotas';
import { RoteirosEquipe } from '@/components/praca/RoteirosEquipe';
import { ShoppingsRotas } from '@/components/praca/ShoppingsRotas';
import { useFeaturesLoteD } from '@/modules/planos/application/use-planos';
import { useActivePraca } from '@/modules/pracas/application/use-pracas';

type Aba = 'dia' | 'dividir' | 'shoppings';

/**
 * Rotas (UX §3.4/§3.7). As abas "Dividir em rotas" e "Shoppings" só existem com as flags do lote D (`features` do
 * `GET settings/config`, nunca sondando rota desligada). A aba que abre é "Dia de cada consultor" (o de hoje): com as flags
 * desligadas a tela é exatamente a de antes.
 */
export default function RoteirosPage() {
  const { praca, isPending } = useActivePraca();
  const { features } = useFeaturesLoteD();
  const [aba, setAba] = useState<Aba>('dia');
  const abas: { id: Aba; rotulo: string }[] = [
    ...(features.route_plans ? [{ id: 'dividir' as const, rotulo: 'Dividir em rotas' }] : []),
    ...(features.malls ? [{ id: 'shoppings' as const, rotulo: 'Shoppings' }] : []),
    { id: 'dia', rotulo: 'Dia de cada consultor' },
  ];
  const atual: Aba = abas.some((a) => a.id === aba) ? aba : 'dia';

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-xl font-extrabold">{abas.length > 1 ? 'Rotas' : 'Roteiros do dia'}</h1>
        <Link href="/consultores" className="text-sm text-primary hover:underline">
          ← Consultores
        </Link>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {abas.length > 1
          ? 'Rotas de visita em sequência lógica pela localização dos estabelecimentos. Monte o dia de cada consultor e acompanhe o planejado × realizado.'
          : 'Monte o dia de cada consultor e acompanhe o planejado × realizado.'}
      </p>
      {abas.length > 1 && (
        <div role="tablist" aria-label="Rotas" className="mt-3 flex flex-wrap gap-2">
          {abas.map((a) => (
            <button
              key={a.id}
              type="button"
              role="tab"
              aria-selected={atual === a.id}
              onClick={() => setAba(a.id)}
              className={`h-12 rounded-md border px-4 text-sm font-bold ${atual === a.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border'}`}
            >
              {a.rotulo}
            </button>
          ))}
        </div>
      )}
      {isPending ? (
        <p className="mt-4 text-sm text-muted-foreground">Carregando…</p>
      ) : !praca ? (
        <p className="mt-4 text-sm text-muted-foreground">Nenhuma praça ainda. Crie uma em Praça para montar roteiros.</p>
      ) : (
        <div className="mt-4">
          {atual === 'dividir' && <DividirRotas praca={praca} />}
          {atual === 'shoppings' && <ShoppingsRotas praca={praca} />}
          {atual === 'dia' && <RoteirosEquipe praca={praca} />}
        </div>
      )}
    </>
  );
}
