'use client';

import {
  CheckCircle2,
  Clock,
  Loader2,
  Map as MapIcon,
  MapPin,
  Ticket,
  TrendingUp,
  Trophy,
  UserCheck,
  Users,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { todaySp } from '@/lib/dates';
import { ROTA, rotaDoRepresentante } from '@/modules/acesso/domain/enderecos';
import { useAuth } from '@/modules/auth/application/use-auth';
import { useAtencao } from '@/modules/consultores/application/use-consultores';
import { useFeaturesLovable, useConfigLovable, usePainel } from '@/modules/painel/application/use-painel';
import { cartoesDoPainel, csvRanking, intervaloDoPeriodo, PERIODOS, posicao, type Cartao, type Periodo } from '@/modules/painel/domain/painel';
import { usePracas } from '@/modules/pracas/application/use-pracas';
import { apiErrorMessage } from '@/modules/shared/infrastructure/http';

/** Ícones dos 8 cartões, os da Lovable (`inicio.tsx`). */
const ICONE: Record<Cartao['id'], LucideIcon> = {
  pct_done: CheckCircle2,
  positivation: TrendingUp,
  time: Clock,
  visits: Users,
  signups: UserCheck,
  vouchers: Ticket,
  pracas_open: MapPin,
  leads_mapped: MapIcon,
};

/** Medalha nos 3 primeiros, como na Lovable; o leitor de tela ouve a posição ("1º"). */
const MEDALHA = ['🥇', '🥈', '🥉'];
function Posicao({ i }: { i: number }) {
  return i < 3 ? (
    <span role="img" aria-label={posicao(i)}>
      {MEDALHA[i]}
    </span>
  ) : (
    <>{i + 1}</>
  );
}

function baixarCsv(nome: string, texto: string) {
  const url = URL.createObjectURL(new Blob([`﻿${texto}`], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const CARTAO = 'rounded-2xl bg-card p-5 shadow-card';

/**
 * Dashboard — painel do gestor no desenho da Lovable (`inicio.tsx`; contrato §33.4, UX §4.1). Cabeçalho com o período (abre em
 * "7 dias"), a faixa "Atenção agora" (nossa), 8 cartões com a conta e a fonte (regra do dono de 08/10), ranking (cadastros, depois
 * positivação) e o resultado das visitas em barras. Atualiza de 60 em 60 s; dia de Brasília.
 */
export function PainelGestor() {
  const { user } = useAuth();
  const cfg = useConfigLovable();
  const features = useFeaturesLovable();
  const [periodo, setPeriodo] = useState<Periodo>('7');
  const [pracaId, setPracaId] = useState('');
  const { data: pracas } = usePracas();
  const faixa = intervaloDoPeriodo(periodo, todaySp());
  const painel = usePainel({ ...faixa, praca_id: pracaId || undefined }, features.dashboard);
  const { data: atencao } = useAtencao();
  const precisam = new Set((atencao?.alerts ?? []).map((a) => a.consultant_id)).size;

  if (cfg.isPending) return <div aria-busy="true" className="h-40 animate-pulse rounded-2xl bg-muted" />;
  if (!features.dashboard) {
    return <p className={`${CARTAO} text-sm`}>Este recurso ainda não está ligado neste servidor.</p>;
  }
  const p = painel.data;
  const primeiroNome = user?.name?.trim().split(/\s+/)[0] ?? '';
  const maxBarra = Math.max(1, ...(p?.by_result.map((b) => b.n) ?? [1]));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">Olá{primeiroNome ? `, ${primeiroNome}` : ''}</h1>
          <p className="flex items-center gap-2 text-muted-foreground" aria-live="polite">
            Painel ao vivo da operação · atualiza a cada minuto
            {painel.isFetching && <Loader2 className="h-3 w-3 animate-spin" aria-label="Atualizando" />}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-lg bg-muted p-1" role="group" aria-label="Período">
            {PERIODOS.map((x) => (
              <Button key={x.id} size="sm" variant={periodo === x.id ? 'default' : 'ghost'} aria-pressed={periodo === x.id} onClick={() => setPeriodo(x.id)}>
                {x.rotulo}
              </Button>
            ))}
          </div>
          <select
            aria-label="Praça"
            value={pracaId}
            onChange={(e) => setPracaId(e.target.value)}
            className="h-11 min-w-40 rounded-md border border-input bg-background px-3 text-sm md:h-9"
          >
            <option value="">Praça: todas</option>
            {(pracas ?? []).map((pr) => (
              <option key={pr.id} value={pr.id}>
                {pr.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {precisam > 0 && (
        <Link
          href={`${ROTA.representantes}#em-campo`}
          className="flex min-h-11 items-center justify-between rounded-xl border border-warning/40 bg-warning/10 px-4 text-sm font-semibold"
        >
          <span>
            ⚠ Atenção agora: {precisam} {precisam === 1 ? 'representante precisa' : 'representantes precisam'} de você
          </span>
          <span aria-hidden>›</span>
        </Link>
      )}

      {painel.isError ? (
        <div className={`${CARTAO} space-y-2`}>
          <p role="alert" className="text-sm text-destructive">
            {apiErrorMessage(painel.error, 'Não foi possível carregar o painel.')}
          </p>
          <Button variant="outline" onClick={() => void painel.refetch()}>
            Tentar de novo
          </Button>
        </div>
      ) : !p ? (
        <div aria-busy="true" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="h-36 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {cartoesDoPainel(p).map((c) => {
              const Icone = ICONE[c.id];
              return (
                <section key={c.id} className={`${CARTAO} min-w-0`} aria-label={c.titulo}>
                  <div className="mb-2 flex items-center justify-between text-sm text-muted-foreground">
                    {c.titulo}
                    <Icone className="h-4 w-4 text-primary" aria-hidden />
                  </div>
                  <div className="text-3xl font-semibold">{c.numero}</div>
                  <div className="break-words text-xs text-muted-foreground">{c.conta}</div>
                  <details className="mt-1 text-xs text-muted-foreground">
                    <summary className="cursor-pointer py-1">ⓘ De onde vem</summary>
                    <p className="break-words">{c.fonte}</p>
                  </details>
                </section>
              );
            })}
          </div>

          <div className="grid gap-4 lg:grid-cols-5">
            <section className={`${CARTAO} min-w-0 lg:col-span-3`}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                  <Trophy className="h-5 w-5 text-primary" aria-hidden />
                  Ranking dos representantes
                </h2>
                {p.ranking.length > 0 && (
                  <Button variant="outline" size="sm" onClick={() => baixarCsv(`ranking-${p.from}-${p.to}.csv`, csvRanking(p))}>
                    Baixar CSV
                  </Button>
                )}
              </div>
              {p.ranking.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Sem visitas registradas no período.</p>
              ) : (
                <>
                  {/* A partir de `sm`, a tabela da Lovable; abaixo, uma linha por pessoa (5 colunas não cabem em 328 px, UX §4.1). */}
                  <table className="hidden w-full text-sm sm:table">
                    <thead className="text-muted-foreground">
                      <tr className="text-left">
                        <th className="py-1">#</th>
                        <th>Representante</th>
                        <th className="text-right">Visitas</th>
                        <th className="text-right">Cadastros</th>
                        <th className="text-right">Positivação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.ranking.map((r, i) => (
                        <tr key={r.consultant_id} className="border-t">
                          <td className="py-2 font-semibold">
                            <Posicao i={i} />
                          </td>
                          <td>
                            <Link href={rotaDoRepresentante(r.consultant_id)} className="hover:underline">
                              {r.name}
                            </Link>
                          </td>
                          <td className="text-right">{r.visits.toLocaleString('pt-BR')}</td>
                          <td className="text-right font-semibold">{r.signups.toLocaleString('pt-BR')}</td>
                          <td className="text-right">{r.positivation_pct == null ? '—' : `${r.positivation_pct}%`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <ol className="space-y-1 sm:hidden">
                    {p.ranking.map((r, i) => (
                      <li key={r.consultant_id}>
                        <Link href={rotaDoRepresentante(r.consultant_id)} className="flex min-h-11 items-center gap-2 rounded-md px-1 text-sm hover:bg-secondary/60">
                          <span className="w-6 shrink-0 font-semibold">
                            <Posicao i={i} />
                          </span>
                          <span className="min-w-0 break-words">
                            {r.name} · {r.signups} {r.signups === 1 ? 'cadastro' : 'cadastros'} · {r.visits} {r.visits === 1 ? 'visita' : 'visitas'} ·{' '}
                            {r.positivation_pct ?? 0}%
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ol>
                  <p className="mt-2 text-xs text-muted-foreground">Ordem: cadastros, depois positivação (cadastros ÷ visitas).</p>
                </>
              )}
            </section>
            <section className={`${CARTAO} min-w-0 lg:col-span-2`}>
              <h2 className="mb-3 text-lg font-semibold">Resultado das visitas</h2>
              <ul className="space-y-2">
                {p.by_result.map((b) => (
                  <li key={b.code}>
                    <div className="flex justify-between text-sm">
                      <span>{b.label}</span>
                      <span className="font-medium">{b.n.toLocaleString('pt-BR')}</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted" aria-hidden>
                      <div className="h-2 rounded-full" style={{ width: `${(100 * b.n) / maxBarra}%`, background: b.color }} />
                    </div>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-muted-foreground">
                Total {p.by_result.reduce((a, b) => a + b.n, 0).toLocaleString('pt-BR')} = visitas realizadas. Situação pela última conclusão de cada visita.
              </p>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
