'use client';

import { CampoTopo } from '@/components/campo/CampoTopo';
import { FaixaFila } from '@/components/campo/FaixaFila';
import { Button } from '@/components/ui/button';
import { irPara } from '@/modules/campo/application/use-tela';

/** Placeholder — a tela de verdade entra na Task 11. */
export function VisitaTela({ refVisita }: { refVisita: string }) {
  return (
    <main className="space-y-5" data-ref={refVisita}>
      <CampoTopo titulo="Visita" />
      <FaixaFila />
      <p className="text-sm text-muted-foreground">Em construção.</p>
      <Button variant="outline" onClick={() => irPara({ v: 'hoje' })} className="h-12 w-full">
        Voltar
      </Button>
    </main>
  );
}
