'use client';

import { Button } from '@/components/ui/button';
import { useFeaturesLovable, useResumoDiaEquipe } from '@/modules/painel/application/use-painel';
import { apiErrorMessage } from '@/modules/shared/infrastructure/http';
import { ResumoDiaConteudo } from './ResumoDiaConteudo';

/** "Resultado do dia" do consultor na página dele (contrato §33.5). Some com `FIELD_DAY_SUMMARY_ENABLED` desligada. */
export function ResumoDiaEquipe({ consultantId, dia }: { consultantId: string; dia: string }) {
  const features = useFeaturesLovable();
  const q = useResumoDiaEquipe(consultantId, dia, features.day_summary);
  if (!features.day_summary) return null;
  return (
    <section className="card-surface space-y-3 p-4" aria-label="Resultado do dia">
      <h2 className="text-base font-bold">Resultado do dia</h2>
      {q.isError ? (
        <div className="space-y-2">
          <p role="alert" className="text-sm text-destructive">
            {apiErrorMessage(q.error, 'Não foi possível calcular o resultado do dia.')}
          </p>
          <Button variant="outline" className="h-12" onClick={() => void q.refetch()}>
            Tentar de novo
          </Button>
        </div>
      ) : !q.data ? (
        <div aria-busy="true" className="h-32 animate-pulse rounded-lg bg-muted" />
      ) : (
        <ResumoDiaConteudo r={q.data} paraEquipe />
      )}
    </section>
  );
}
