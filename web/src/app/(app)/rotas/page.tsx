'use client';

import { Store } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { DividirRotas } from '@/components/praca/DividirRotas';
import { RoteirosEquipe } from '@/components/praca/RoteirosEquipe';
import { ShoppingsRotas } from '@/components/praca/ShoppingsRotas';
import { Label } from '@/components/ui/label';
import { useFeaturesLoteD } from '@/modules/planos/application/use-planos';
import { useActivePraca, usePracas, useSetActivePraca, type PracaView } from '@/modules/pracas/application/use-pracas';
import { cidadeUf } from '@/modules/pracas/domain/status-praca';
import { apiErrorMessage } from '@/modules/shared/infrastructure/http';

type Aba = 'dia' | 'dividir' | 'shoppings';

/**
 * "Praça" da barra da Lovable ("{nome} — {cidade}/{UF}"): troca a praça ATIVA da conta (`active_praca_id`, a mesma que as outras telas
 * leem) só quando a pessoa escolhe outra — nunca ao abrir a tela.
 */
function SeletorPraca({ praca }: { praca: PracaView }) {
  const { data: pracas } = usePracas();
  const trocar = useSetActivePraca();
  return (
    <div className="space-y-1">
      <Label htmlFor="rotas-praca">Praça</Label>
      <select
        id="rotas-praca"
        value={praca.id}
        disabled={trocar.isPending}
        onChange={(e) => trocar.mutate(e.target.value, { onError: (err) => toast.error(apiErrorMessage(err, 'Não foi possível trocar a praça.')) })}
        className="h-11 w-full min-w-56 rounded-md border border-input bg-background px-2 text-sm md:h-9"
      >
        {(pracas ?? []).map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} — {cidadeUf(p)}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Rotas (Lovable `rotas.tsx`, UX §4.6, arquitetura §5 E5.4 e D6): abas "Clientes" (dividir a área em rotas) · "Shoppings" · "Dia de
 * cada representante" (o nosso roteiro do dia, 3ª). Com os planos ligados a tela ABRE em "Clientes" (Lovable); sem eles só existe o dia
 * e a tela fica sem abas, como antes. As abas só existem com as flags do lote D (`features` do `GET settings/config`, nunca sondando).
 */
export default function RoteirosPage() {
  const { praca, isPending } = useActivePraca();
  const { features, carregando } = useFeaturesLoteD();
  const [aba, setAba] = useState<Aba | null>(null);
  const abas: { id: Aba; rotulo: string }[] = [
    ...(features.route_plans ? [{ id: 'dividir' as const, rotulo: 'Clientes' }] : []),
    ...(features.malls ? [{ id: 'shoppings' as const, rotulo: 'Shoppings' }] : []),
    { id: 'dia', rotulo: 'Dia de cada representante' },
  ];
  const padrao: Aba = features.route_plans ? 'dividir' : 'dia';
  const atual: Aba = aba && abas.some((a) => a.id === aba) ? aba : padrao;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-semibold">Rotas</h1>
        <p className="text-muted-foreground">
          {abas.length > 1 ? 'Rotas de visita em sequência lógica pela localização dos clientes.' : 'Monte o dia de cada representante e acompanhe o planejado × realizado.'}
        </p>
      </div>
      {abas.length > 1 && (
        <div role="tablist" aria-label="Rotas" className="flex flex-wrap gap-2">
          {abas.map((a) => (
            <button
              key={a.id}
              type="button"
              role="tab"
              aria-selected={atual === a.id}
              onClick={() => setAba(a.id)}
              className={`inline-flex min-h-11 items-center gap-2 rounded-md border px-4 text-sm font-medium md:min-h-9 ${atual === a.id ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-background hover:bg-secondary'}`}
            >
              {a.id === 'shoppings' && <Store className="h-4 w-4" aria-hidden />}
              {a.rotulo}
            </button>
          ))}
        </div>
      )}
      {/* Sem saber as flags ainda, nada monta: a aba que abre depende delas (sem piscar o "Dia" antes de "Clientes"). */}
      {isPending || carregando ? (
        <div aria-busy="true" className="h-48 animate-pulse rounded-2xl bg-muted" />
      ) : !praca ? (
        <p className="rounded-2xl bg-card p-5 text-sm text-muted-foreground shadow-card">Nenhuma praça ainda. Crie uma em Praças para montar as rotas.</p>
      ) : (
        <>
          {atual === 'dividir' && <DividirRotas praca={praca} seletorPraca={<SeletorPraca praca={praca} />} />}
          {atual !== 'dividir' && (
            <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4">
              <SeletorPraca praca={praca} />
            </div>
          )}
          {atual === 'shoppings' && <ShoppingsRotas praca={praca} />}
          {atual === 'dia' && <RoteirosEquipe praca={praca} />}
        </>
      )}
    </div>
  );
}
