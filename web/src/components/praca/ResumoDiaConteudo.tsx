'use client';

import { linhasDoResumo, notaTexto, type ResumoDiaView } from '@/modules/painel/domain/painel';

/**
 * O "Resultado do dia" (contrato §33.5, UX §3.6) — mesmo conteúdo para o consultor e para a equipe. A nota só aparece com
 * `display = nota`, sempre com a conta; com `numeros`, só os números.
 */
export function ResumoDiaConteudo({ r, paraEquipe = false }: { r: ResumoDiaView; paraEquipe?: boolean }) {
  const comNota = r.display === 'nota' && r.nota != null;
  // As linhas da fórmula vêm primeiro na conta (o servidor as escreve só com a nota).
  const formula = comNota ? r.conta.slice(0, 4) : [];
  const resto = comNota ? r.conta.slice(4) : r.conta;
  return (
    <div className="space-y-4">
      {comNota && (
        <div className="space-y-1 text-center">
          <p className="font-display text-[2.5rem] font-extrabold leading-none">{notaTexto(r.nota!)}</p>
          <p className="text-sm text-muted-foreground">nota de 0 a 10</p>
          <ul className="space-y-0.5 text-left text-sm">
            {formula.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </div>
      )}
      {!comNota && r.display !== 'nota' && paraEquipe && (
        <p className="text-sm text-muted-foreground">{r.display === 'numeros' ? 'Configurado para mostrar só os números (sem nota).' : 'O consultor não vê o resumo (desligado na configuração).'}</p>
      )}
      <dl className="divide-y divide-border rounded-md border border-border">
        {linhasDoResumo(r).map(([k, v]) => (
          <div key={k} className="flex min-h-12 items-center justify-between gap-3 px-3 text-sm">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="text-right font-bold">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="space-y-1">
        <p className="text-sm font-bold">Avaliação</p>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {r.avaliacao.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      </div>
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer py-2 text-sm">ⓘ Como contamos</summary>
        <ul className="space-y-0.5">
          {resto.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}
