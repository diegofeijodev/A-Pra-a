'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { todaySp } from '@/lib/dates';
import { useAuth } from '@/modules/auth/application/use-auth';
import { hora } from '@/modules/campo/domain/formatos';
import { useAtencao } from '@/modules/consultores/application/use-consultores';
import { useFeaturesLovable, useConfigLovable, usePainel } from '@/modules/painel/application/use-painel';
import { cartoesDoPainel, csvRanking, intervaloDoPeriodo, PERIODOS, posicao, type Periodo } from '@/modules/painel/domain/painel';
import { usePracas } from '@/modules/pracas/application/use-pracas';
import { apiErrorMessage } from '@/modules/shared/infrastructure/http';

const chip = (ativo: boolean) =>
  `h-12 min-w-[5.25rem] rounded-md border px-3 text-sm font-bold ${ativo ? 'border-primary bg-primary/15 text-foreground' : 'border-border text-muted-foreground'}`;

function baixarCsv(nome: string, texto: string) {
  const url = URL.createObjectURL(new Blob([`﻿${texto}`], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Início — painel do gestor (contrato §33.4, UX §3.1; Lovable `inicio.tsx`). 8 cartões, cada um com a conta e a fonte;
 * ranking (cadastros, depois positivação) e resultado das visitas. Atualiza de 60 em 60 s; dia de Brasília.
 */
export function PainelGestor() {
  const { user } = useAuth();
  const cfg = useConfigLovable();
  const features = useFeaturesLovable();
  const [periodo, setPeriodo] = useState<Periodo>('hoje');
  const [pracaId, setPracaId] = useState('');
  const { data: pracas } = usePracas();
  const faixa = intervaloDoPeriodo(periodo, todaySp());
  const painel = usePainel({ ...faixa, praca_id: pracaId || undefined }, features.dashboard);
  const { data: atencao } = useAtencao();
  const precisam = new Set((atencao?.alerts ?? []).map((a) => a.consultant_id)).size;

  if (cfg.isPending) return <div aria-busy="true" className="mt-4 h-40 animate-pulse rounded-lg bg-muted" />;
  if (!features.dashboard) {
    return <p className="card-surface mt-4 p-4 text-sm">Este recurso ainda não está ligado neste servidor.</p>;
  }
  const p = painel.data;
  const primeiroNome = user?.name?.split(' ')[0] ?? '';
  const maxBarra = Math.max(1, ...(p?.by_result.map((b) => b.n) ?? [1]));

  return (
    <div className="mt-2 space-y-4">
      <div className="space-y-1">
        <h1 className="font-display text-xl font-extrabold">Olá{primeiroNome ? `, ${primeiroNome}` : ''}</h1>
        <p className="text-sm text-muted-foreground" aria-live="polite">
          Painel ao vivo da operação{p ? ` · atualizado às ${hora(p.generated_at)}` : ''}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Período">
        {PERIODOS.map((x) => (
          <button key={x.id} type="button" aria-pressed={periodo === x.id} onClick={() => setPeriodo(x.id)} className={chip(periodo === x.id)}>
            {x.rotulo}
          </button>
        ))}
        <label htmlFor="painel-praca" className="sr-only">
          Praça
        </label>
        <select id="painel-praca" value={pracaId} onChange={(e) => setPracaId(e.target.value)} className="h-12 min-w-40 rounded-md border border-border bg-background px-3 text-sm">
          <option value="">Praça: todas</option>
          {(pracas ?? []).map((pr) => (
            <option key={pr.id} value={pr.id}>
              {pr.name}
            </option>
          ))}
        </select>
      </div>
      {precisam > 0 && (
        <Link href="/consultores" className="flex min-h-14 items-center justify-between rounded-md border border-warning bg-warning/10 px-4 text-sm font-bold">
          <span>⚠ Atenção agora: {precisam} {precisam === 1 ? 'consultor precisa' : 'consultores precisam'} de você</span>
          <span aria-hidden>›</span>
        </Link>
      )}

      {painel.isError ? (
        <div className="card-surface space-y-2 p-4">
          <p role="alert" className="text-sm text-destructive">
            {apiErrorMessage(painel.error, 'Não foi possível carregar o painel.')}
          </p>
          <Button variant="outline" onClick={() => void painel.refetch()} className="h-12">
            Tentar de novo
          </Button>
        </div>
      ) : !p ? (
        <div aria-busy="true" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {cartoesDoPainel(p).map((c) => (
              <section key={c.id} className="card-surface min-w-0 space-y-1 p-3" aria-label={c.titulo}>
                <p className="text-sm font-bold text-muted-foreground">{c.titulo}</p>
                <p className="font-display text-2xl font-extrabold">{c.numero}</p>
                <p className="break-words text-xs text-muted-foreground">{c.conta}</p>
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer py-1">ⓘ De onde vem</summary>
                  <p className="break-words">{c.fonte}</p>
                </details>
              </section>
            ))}
          </div>

          {p.kpis.visits === 0 ? (
            <div className="card-surface space-y-2 p-4">
              <p className="text-sm">Ainda não há visitas nesse período. Escolha outro período ou veja os roteiros de hoje.</p>
              <Link href="/consultores/roteiros" className="inline-flex h-12 items-center rounded-md border border-border px-4 text-sm font-bold">
                Rotas
              </Link>
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              <section className="card-surface min-w-0 space-y-3 p-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-base font-bold">🏆 Ranking dos consultores</h2>
                  <Button variant="outline" className="h-12" onClick={() => baixarCsv(`ranking-${p.from}-${p.to}.csv`, csvRanking(p))}>
                    Baixar CSV
                  </Button>
                </div>
                <ol className="space-y-1">
                  {p.ranking.map((r, i) => (
                    <li key={r.consultant_id}>
                      <Link href={`/consultores/${r.consultant_id}`} className="flex min-h-14 items-center justify-between gap-3 rounded-md px-2 hover:bg-secondary/60">
                        <span className="min-w-0">
                          <span className="font-bold">{posicao(i)}</span> {r.name}
                        </span>
                        <span className="shrink-0 text-right text-sm text-muted-foreground">
                          {r.signups} {r.signups === 1 ? 'cadastro' : 'cadastros'} · {r.visits} {r.visits === 1 ? 'visita' : 'visitas'} · {r.positivation_pct ?? 0}%
                        </span>
                      </Link>
                    </li>
                  ))}
                </ol>
                <p className="text-xs text-muted-foreground">Ordem: cadastros, depois positivação (cadastros ÷ visitas).</p>
              </section>
              <section className="card-surface min-w-0 space-y-2 p-4">
                <h2 className="text-base font-bold">Resultado das visitas</h2>
                <ul className="space-y-2">
                  {p.by_result.map((b) => (
                    <li key={b.code} className="grid grid-cols-[minmax(0,9rem)_3rem_1fr] items-center gap-2 text-sm">
                      <span className="truncate">{b.label}</span>
                      <span className="text-right font-bold">{b.n.toLocaleString('pt-BR')}</span>
                      <span className="h-3 rounded-sm" style={{ width: `${Math.round((100 * b.n) / maxBarra)}%`, backgroundColor: b.color }} aria-hidden />
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground">
                  Total {p.by_result.reduce((a, b) => a + b.n, 0).toLocaleString('pt-BR')} = visitas realizadas. Situação pela última conclusão de cada visita.
                </p>
              </section>
            </div>
          )}
        </>
      )}
    </div>
  );
}
