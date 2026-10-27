'use client';

import { Button } from '@/components/ui/button';
import { EmBreve } from '@/components/ui/EmBreve';
import { useCampoMe } from '@/modules/campo/application/use-campo';
import { irPara } from '@/modules/campo/application/use-tela';

/**
 * Aba "Desempenho" do representante (`?v=desempenho`): "Em construção", como na Lovable, com o atalho para o "Resultado do seu dia"
 * que já existe (decisão D5) — só com `features.day_summary` do `/me`.
 */
export function DesempenhoTela() {
  const resumoLigado = useCampoMe().data?.features?.day_summary === true;
  return (
    <main className="space-y-4">
      <EmBreve titulo="Desempenho" descricao="Seus indicadores de visitas, cadastros e conversão.">
        {resumoLigado && (
          <Button variant="outline" className="h-12 w-full" onClick={() => irPara({ v: 'resumo' })}>
            Ver o resultado do seu dia
          </Button>
        )}
      </EmBreve>
    </main>
  );
}
