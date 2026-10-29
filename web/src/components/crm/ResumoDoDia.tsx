'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { addDays, todaySp } from '@/lib/dates';
import { useResumoCrm } from '@/modules/crm/application/use-crm';
import { fontesDoResumo, linhasDoResumo, resumoZerado } from '@/modules/crm/domain/tarefas';
import { diaCurto } from '@/modules/planos/domain/planos';

type Quando = 'hoje' | 'ontem';

/**
 * Resumo do dia (UX §3.1.6, `GET /v1/crm/summary`): o que aconteceu na praça, cada número com a conta e a fonte (regra do dono, 08/10).
 * "Hoje | Ontem" porque de manhã o de hoje está quase vazio (achado 2). Só monta com `features.crm_tasks` (a tela decide). Consulta
 * própria: se falhar, as tarefas continuam.
 */
export function ResumoDoDia({ pracaId, pracaNome }: { pracaId: string; pracaNome: string }) {
  const [quando, setQuando] = useState<Quando>('hoje');
  const hoje = todaySp();
  // O dia explícito nos dois (a chave da consulta vira à meia-noite).
  const dia = quando === 'hoje' ? hoje : addDays(hoje, -1);
  const resumo = useResumoCrm(pracaId, dia, { enabled: true });
  // O resumo de outro dia ou de outra praça, guardado enquanto o novo chega, não aparece com o título deste.
  const r = resumo.isPlaceholderData ? undefined : resumo.data;

  return (
    <section id="resumo-do-dia" aria-labelledby="resumo-do-dia-titulo" className="scroll-mt-4 rounded-2xl bg-card p-5 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="resumo-do-dia-titulo" className="text-lg font-semibold">
          Resumo do dia
        </h2>
        <div className="flex gap-1 rounded-lg bg-muted p-1" role="group" aria-label="Dia do resumo">
          {(['hoje', 'ontem'] as const).map((q) => (
            <Button key={q} size="sm" variant={quando === q ? 'default' : 'ghost'} aria-pressed={quando === q} onClick={() => setQuando(q)}>
              {q === 'hoje' ? 'Hoje' : 'Ontem'}
            </Button>
          ))}
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        {diaCurto(dia)} · {pracaNome}
      </p>

      {resumo.isError && !r ? (
        <div className="mt-4 space-y-2">
          <p role="alert" className="text-sm text-destructive">
            Não deu para carregar o resumo.
          </p>
          <Button variant="outline" onClick={() => void resumo.refetch()}>
            Tentar de novo
          </Button>
        </div>
      ) : !r ? (
        <div aria-busy="true" className="mt-4 h-64 animate-pulse rounded-2xl bg-muted" />
      ) : quando === 'hoje' && resumoZerado(r) ? (
        <div className="mt-4 space-y-3">
          <p className="text-sm">Ainda não aconteceu nada hoje.</p>
          <Button variant="outline" size="sm" onClick={() => setQuando('ontem')}>
            Ver o resumo de ontem
          </Button>
        </div>
      ) : (
        <>
          <dl className="mt-3 divide-y">
            {linhasDoResumo(r, quando).map((l) => (
              <div key={l.chave} className="py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-sm text-muted-foreground">{l.rotulo}</dt>
                  <dd className="text-2xl font-semibold">
                    {l.numero === '—' ? (
                      <>
                        <span aria-hidden>—</span>
                        <span className="sr-only">sem dado</span>
                      </>
                    ) : (
                      l.numero
                    )}
                  </dd>
                </div>
                <dd className="break-words text-xs text-muted-foreground">{l.conta}</dd>
                {l.extra && <dd className="break-words text-xs text-muted-foreground">{l.extra}</dd>}
              </div>
            ))}
          </dl>
          <details className="mt-1 text-xs text-muted-foreground">
            <summary className="cursor-pointer py-1">ⓘ De onde vem</summary>
            <ul className="space-y-1">
              {fontesDoResumo(r).map((f) => (
                <li key={f.rotulo} className="break-words">
                  <span className="font-medium">{f.rotulo}:</span> {f.texto}
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
    </section>
  );
}
