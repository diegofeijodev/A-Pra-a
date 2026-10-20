'use client';

import { CampoTopo } from '@/components/campo/CampoTopo';
import { NavegarLinks, ParadaAcoes } from '@/components/campo/ParadaAcoes';
import { Button } from '@/components/ui/button';
import { useDia } from '@/modules/campo/application/use-campo';
import { irPara } from '@/modules/campo/application/use-tela';
import { useRoteiro } from '@/modules/rotas/application/use-roteiro';
import { etaTexto, trechoTexto, velocidadeDoRoteiro } from '@/modules/rotas/domain/rota-local';

/** Visão `parada` de `/campo` (UX §4.4): detalhe, navegação, pular / deixar para depois e "Cheguei". */
export function ParadaTela({ id }: { id: string }) {
  const rot = useRoteiro();
  const { dia } = useDia();
  const parada = rot.route?.stops.find((s) => s.id === id);
  const voltar = () => irPara({ v: 'roteiro' }, 'replace');

  if (rot.carregando) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  if (!rot.route || !parada) {
    return (
      <main className="space-y-4">
        <CampoTopo titulo="Parada" />
        <p className="card-surface p-5 text-sm">Parada não encontrada neste roteiro.</p>
        <button type="button" onClick={() => irPara({ v: 'hoje' })} className="flex h-12 w-full items-center justify-center rounded-md border border-border text-sm font-bold">
          Voltar para Hoje
        </button>
      </main>
    );
  }
  const pode = parada.status === 'pendente' || parada.status === 'adiada';
  return (
    <main className="space-y-5 pb-28">
      <CampoTopo titulo={parada.name} />
      <section className="card-surface space-y-1 p-4">
        <p className="text-sm">{parada.address || 'Sem endereço'}</p>
        <p className="text-sm text-muted-foreground">
          {trechoTexto(parada.distance_m, velocidadeDoRoteiro(rot.route), rot.route.travel_mode)} (estimado, desde a parada anterior)
          {parada.status === 'pendente' && parada.eta ? ` · chega por volta das ${etaTexto(parada.eta)}` : ''}
        </p>
        {parada.status === 'visitada' && <p className="text-sm font-bold text-success">✓ Visita feita</p>}
      </section>
      <NavegarLinks parada={parada} />
      <ParadaAcoes parada={parada} params={rot.route.params} />
      <button type="button" onClick={voltar} className="flex h-12 w-full items-center justify-center rounded-md border border-border text-sm font-bold">
        Voltar para o roteiro
      </button>
      {pode && !dia.visitaAberta && (
        <div className="fixed inset-x-0 bottom-0 border-t border-border bg-background/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
          <div className="mx-auto max-w-md">
            <Button onClick={() => irPara({ v: 'nova', parada: parada.id })} className="h-14 w-full text-base">
              Cheguei: fazer check-in
            </Button>
          </div>
        </div>
      )}
    </main>
  );
}
