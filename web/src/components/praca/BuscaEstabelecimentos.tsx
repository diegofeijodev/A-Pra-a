'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/modules/auth/application/use-auth';
import { useAreas } from '@/modules/areas/application/use-areas';
import { rotuloRaio } from '@/modules/areas/domain/area-form';
import {
  useAddLeads,
  useCancelSearch,
  useCandidates,
  useSearch,
  useSearches,
  useSources,
  useStartSearch,
} from '@/modules/places/application/use-places';
import {
  alternar,
  avisoPago,
  emAndamento,
  filtrar,
  idsParaAdicionar,
  limparVisiveis,
  mensagemVazia,
  progressoTexto,
  resumoTexto,
  rotuloCache,
  rotuloDistancia,
  rotuloSituacao,
  selecaoPadrao,
  selecionarVisiveis,
  textoConfirmacao,
  TIPOS,
  type ModoLista,
} from '@/modules/places/domain/busca';
import type { FonteLugar, TipoLugar } from '@/modules/places/infrastructure/places.api';
import type { PracaView } from '@/modules/pracas/application/use-pracas';
import { apiErrorMessage } from '@/modules/shared/infrastructure/http';

const MODOS: { id: ModoLista; label: string }[] = [
  { id: 'todos', label: 'Todos' },
  { id: 'novos', label: 'Novos' },
  { id: 'na_praca', label: 'Já na praça' },
];

/**
 * "Buscar estabelecimentos" (F2, contrato §22; UX §5.1): área + tipos → busca em
 * segundo plano com progresso → revisão em lista → "Adicionar N leads" com
 * confirmação escrita. Só admin dispara. A lista é a forma principal; o mapa
 * fica para a próxima fase.
 */
export function BuscaEstabelecimentos({ praca }: { praca: PracaView }) {
  const { user } = useAuth();
  const admin = !!user?.is_admin;
  const { data: areas, isPending: carregandoAreas, isError: erroAreas, refetch: refazerAreas } = useAreas(praca.id);
  const { data: fontes } = useSources(admin);
  const { data: recentes } = useSearches(admin ? praca.id : undefined);
  const iniciar = useStartSearch();
  const cancelar = useCancelSearch(praca.id);
  const adicionar = useAddLeads(praca.id);

  const ativas = useMemo(() => (areas ?? []).filter((a) => a.active), [areas]);
  const [areaId, setAreaId] = useState('');
  const [tipos, setTipos] = useState<TipoLugar[]>(['bar', 'restaurante']);
  const [fonte, setFonte] = useState<FonteLugar>('osm');
  const [runId, setRunId] = useState<string | null>(null);
  const [modo, setModo] = useState<ModoLista>('todos');
  const [texto, setTexto] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [confirmando, setConfirmando] = useState(false);
  const [feito, setFeito] = useState<{ n: number; pulados: number } | null>(null);

  // Trocar de praça limpa tudo.
  useEffect(() => {
    setAreaId('');
    setRunId(null);
    setSel(new Set());
    setFeito(null);
  }, [praca.id]);
  useEffect(() => {
    if (!areaId && ativas[0]) setAreaId(ativas[0].id);
  }, [areaId, ativas]);

  const { data: run, isError: erroRun, refetch: refazerRun } = useSearch(runId, praca.id);
  const pronto = run?.status === 'done';
  const { data: cands, isPending: carregandoCands, isError: erroCands, refetch: refazerCands } = useCandidates(runId, praca.id, pronto);

  // Ao chegar a lista, marca todos os novos (padrão do UX).
  useEffect(() => {
    if (cands) setSel(selecaoPadrao(cands));
  }, [cands]);

  const visiveis = useMemo(() => filtrar(cands ?? [], { texto, modo }), [cands, texto, modo]);
  const ids = useMemo(() => idsParaAdicionar(sel, cands ?? []), [sel, cands]);
  const area = ativas.find((a) => a.id === areaId);
  const fonteAtual = fontes?.find((f) => f.id === fonte);
  const apifyDisponivel = fontes?.some((f) => f.id === 'apify' && f.available) ?? false;
  const ocupada = emAndamento(run) || iniciar.isPending;
  const podeBuscar = admin && !!area && tipos.length > 0 && !ocupada;

  if (!admin) {
    return (
      <p className="mt-4 text-sm text-muted-foreground">
        Só administradores podem buscar estabelecimentos. Peça a quem administra a praça.
      </p>
    );
  }

  const buscar = (refresh = false) => {
    if (!area) return;
    setFeito(null);
    setSel(new Set());
    iniciar.mutate(
      { praca_id: praca.id, area_id: area.id, types: tipos, source: fonte, refresh },
      { onSuccess: (r) => setRunId(r.id) },
    );
  };
  const alternarTipo = (t: TipoLugar) =>
    setTipos((atual) => (atual.includes(t) ? atual.filter((x) => x !== t) : [...atual, t]));

  const confirmar = () => {
    if (!runId) return;
    adicionar.mutate(
      { id: runId, ids },
      {
        onSuccess: (r) => {
          setConfirmando(false);
          setFeito({ n: r.created, pulados: r.skipped.length });
          setSel(new Set());
        },
        onError: () => setConfirmando(false),
      },
    );
  };
  const textoConf = textoConfirmacao(ids.length, praca.name);

  return (
    <div className="mt-4 grid gap-6 lg:grid-cols-[320px_1fr]">
      {/* 1 e 2 — onde e o quê */}
      <section className="space-y-5" aria-labelledby="busca-onde">
        <div>
          <h2 id="busca-onde" className="text-sm font-semibold">1. Onde buscar</h2>
          <p className="mt-1 text-xs text-muted-foreground">Praça: {praca.name}</p>
          {carregandoAreas ? (
            <p className="mt-2 text-sm text-muted-foreground">Carregando áreas…</p>
          ) : erroAreas ? (
            <div className="mt-2 space-y-2">
              <p role="alert" className="text-sm text-destructive">Não conseguimos carregar as áreas. Nada foi alterado.</p>
              <Button variant="outline" size="sm" onClick={() => void refazerAreas()}>Tentar de novo</Button>
            </div>
          ) : ativas.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Esta praça ainda não tem uma área de atuação. Crie uma em{' '}
              <Link href="/configuracoes" className="text-primary underline">Configurações</Link>
              {' '}(centro no mapa e raio) e volte aqui.
            </p>
          ) : (
            <label className="mt-2 block text-xs text-muted-foreground">
              Área
              <select
                value={areaId}
                onChange={(e) => setAreaId(e.target.value)}
                disabled={ocupada}
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
              >
                {ativas.map((a) => (
                  <option key={a.id} value={a.id}>{a.name} · raio {rotuloRaio(a.radius_m)}</option>
                ))}
              </select>
            </label>
          )}
        </div>

        <fieldset disabled={ocupada}>
          <legend className="text-sm font-semibold">2. O que buscar</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {TIPOS.map((t) => {
              const ligado = tipos.includes(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={ligado}
                  onClick={() => alternarTipo(t.id)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    ligado ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:bg-secondary/60'
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
          {tipos.length === 0 && <p className="mt-2 text-xs text-destructive">Escolha pelo menos um tipo.</p>}
        </fieldset>

        {apifyDisponivel && (
          <fieldset disabled={ocupada}>
            <legend className="text-xs text-muted-foreground">Fonte</legend>
            <div className="mt-1 space-y-1">
              {(fontes ?? []).filter((f) => f.available).map((f) => (
                <label key={f.id} className="flex items-center gap-2 text-sm">
                  <input type="radio" name="fonte" checked={fonte === f.id} onChange={() => setFonte(f.id)} />
                  {f.label}{f.paid ? ' (pago)' : ' (grátis)'}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        {avisoPago(fonteAtual) && <p className="rounded-md border border-border p-2 text-xs text-muted-foreground">{avisoPago(fonteAtual)}</p>}

        <Button className="w-full" disabled={!podeBuscar} onClick={() => buscar(false)}>
          {ocupada ? 'Buscando…' : 'Buscar'}
        </Button>

        {recentes && recentes.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground">Buscas recentes</h3>
            <ul className="mt-1 space-y-1">
              {recentes.filter((r) => r.status === 'done').slice(0, 5).map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => { setRunId(r.id); setFeito(null); }}
                    className={`w-full rounded-md px-2 py-1.5 text-left text-xs hover:bg-secondary/60 ${runId === r.id ? 'bg-secondary/60' : ''}`}
                  >
                    {rotuloCache(r)}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* 3 — resultado e revisão */}
      <section aria-labelledby="busca-resultado" aria-live="polite" className="min-w-0">
        <h2 id="busca-resultado" className="text-sm font-semibold">3. Escolha quais entram</h2>

        {!runId && (
          <p className="mt-3 text-sm text-muted-foreground">
            Escolha uma área e o que buscar. Os resultados aparecem aqui para você revisar antes de adicionar.
          </p>
        )}

        {runId && !run && !erroRun && <p className="mt-3 text-sm text-muted-foreground">Carregando a busca…</p>}
        {runId && erroRun && (
          <div className="mt-3 space-y-2">
            <p role="alert" className="text-sm text-destructive">Não conseguimos carregar esta busca. Nada foi alterado.</p>
            <Button variant="outline" size="sm" onClick={() => void refazerRun()}>Tentar de novo</Button>
          </div>
        )}

        {run && emAndamento(run) && (
          <div className="mt-3 rounded-md border border-border p-4">
            <p className="text-sm font-medium">{progressoTexto(run)}</p>
            <div className="mt-2 h-1.5 overflow-hidden rounded bg-secondary">
              <div className="h-full w-1/3 animate-pulse rounded bg-primary" />
            </div>
            <Button className="mt-3" variant="outline" size="sm" disabled={cancelar.isPending} onClick={() => cancelar.mutate(run.id)}>
              Cancelar
            </Button>
          </div>
        )}

        {run?.status === 'error' && (
          <div className="mt-3 space-y-2">
            <p role="alert" className="text-sm text-destructive">{run.error ?? 'A busca não funcionou agora. Nada foi cobrado.'}</p>
            <Button variant="outline" size="sm" disabled={!podeBuscar} onClick={() => buscar(true)}>Tentar de novo</Button>
          </div>
        )}
        {run?.status === 'cancelled' && <p className="mt-3 text-sm text-muted-foreground">Busca cancelada. Nada foi cobrado.</p>}

        {run && pronto && (
          <div className="mt-3 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">{resumoTexto(run)}</p>
              <p className="text-xs text-muted-foreground">
                {run.cached ? `${rotuloCache(run)} (guardada, sem nova consulta). ` : ''}
                <button type="button" className="underline hover:text-primary" disabled={!podeBuscar} onClick={() => buscar(true)}>
                  Buscar de novo
                </button>
              </p>
            </div>
            {run.truncated && (
              <p role="status" className="rounded-md border border-border p-2 text-sm">
                Achamos mais de 300 nesta área. Mostramos 300. Reduza a área para ver todos.
              </p>
            )}
            {mensagemVazia(run) && <p className="text-sm text-muted-foreground">{mensagemVazia(run)}</p>}

            {feito && (
              <div role="status" className="space-y-2 rounded-md border border-primary/40 bg-primary/5 p-3">
                <p className="text-sm font-medium">
                  {feito.n} {feito.n === 1 ? 'lead adicionado' : 'leads adicionados'} à praça {praca.name}
                  {feito.pulados > 0 ? ` (${feito.pulados} ficaram de fora: já estavam na praça)` : ''}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button asChild size="sm" variant="outline"><Link href="/praca">Ver a praça</Link></Button>
                  <Button asChild size="sm" variant="outline"><Link href="/entrada">Ver em Entrada (desfazer)</Link></Button>
                </div>
              </div>
            )}

            {run.found > 0 && (
              <>
                {carregandoCands ? (
                  <p className="text-sm text-muted-foreground">Carregando a lista…</p>
                ) : erroCands ? (
                  <div className="space-y-2">
                    <p role="alert" className="text-sm text-destructive">Não conseguimos carregar a lista. Nada foi alterado.</p>
                    <Button variant="outline" size="sm" onClick={() => void refazerCands()}>Tentar de novo</Button>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        className="max-w-xs"
                        placeholder="Buscar na lista…"
                        aria-label="Buscar na lista"
                        value={texto}
                        onChange={(e) => setTexto(e.target.value)}
                      />
                      <div role="group" aria-label="Mostrar" className="flex gap-1">
                        {MODOS.map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            aria-pressed={modo === m.id}
                            onClick={() => setModo(m.id)}
                            className={`rounded-md px-2.5 py-1 text-xs ${modo === m.id ? 'bg-secondary font-semibold' : 'text-muted-foreground hover:bg-secondary/60'}`}
                          >
                            {m.label}
                          </button>
                        ))}
                      </div>
                      <button type="button" className="text-xs text-primary underline" onClick={() => setSel((s) => selecionarVisiveis(s, visiveis))}>
                        Selecionar todos os novos
                      </button>
                      <button type="button" className="text-xs text-muted-foreground underline" onClick={() => setSel((s) => limparVisiveis(s, visiveis))}>
                        Limpar
                      </button>
                    </div>

                    <div className="overflow-x-auto rounded-md border border-border">
                      <table className="w-full min-w-[640px] text-left text-xs">
                        <thead className="bg-secondary/40 text-muted-foreground">
                          <tr>
                            <th className="w-9 px-2 py-2"><span className="sr-only">Escolher</span></th>
                            <th className="px-2 py-2">Nome</th>
                            <th className="px-2 py-2">Endereço</th>
                            <th className="px-2 py-2">Dist.</th>
                            <th className="px-2 py-2">Telefone</th>
                            <th className="px-2 py-2">Situação</th>
                          </tr>
                        </thead>
                        <tbody>
                          {visiveis.length === 0 && (
                            <tr><td colSpan={6} className="px-2 py-4 text-center text-muted-foreground">Nenhum resultado com esse filtro.</td></tr>
                          )}
                          {visiveis.map((c) => (
                            <tr key={c.id} className={`border-t border-border ${c.selectable ? '' : 'text-muted-foreground'}`}>
                              <td className="px-2 py-1.5">
                                <Checkbox
                                  checked={sel.has(c.id)}
                                  disabled={!c.selectable}
                                  aria-label={`Escolher ${c.name}`}
                                  onCheckedChange={() => setSel((s) => alternar(s, c))}
                                />
                              </td>
                              <td className="px-2 py-1.5 font-medium">{c.name}</td>
                              <td className="px-2 py-1.5">{c.address || '—'}</td>
                              <td className="whitespace-nowrap px-2 py-1.5">{rotuloDistancia(c.distance_m)}</td>
                              <td className="whitespace-nowrap px-2 py-1.5">{c.phone || '—'}</td>
                              <td className="px-2 py-1.5">
                                {rotuloSituacao(c)}
                                {c.lead_name ? <span className="block text-[11px]">como “{c.lead_name}”</span> : null}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-2 border-t border-border bg-background py-3">
                      <p className="text-sm">{ids.length} {ids.length === 1 ? 'selecionado' : 'selecionados'}</p>
                      <Button disabled={ids.length === 0 || adicionar.isPending} onClick={() => setConfirmando(true)}>
                        {ids.length === 0 ? 'Adicionar como leads' : `Adicionar ${ids.length} como leads`}
                      </Button>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        )}
      </section>

      <AlertDialog open={confirmando} onOpenChange={(o) => !adicionar.isPending && setConfirmando(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{textoConf.titulo}</AlertDialogTitle>
            <AlertDialogDescription>{textoConf.corpo}</AlertDialogDescription>
          </AlertDialogHeader>
          {adicionar.isError && (
            <p role="alert" className="text-sm text-destructive">{apiErrorMessage(adicionar.error, 'Não foi possível adicionar.')}</p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={adicionar.isPending}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              disabled={adicionar.isPending}
              onClick={(e) => {
                e.preventDefault();
                confirmar();
              }}
            >
              {adicionar.isPending ? 'Adicionando…' : textoConf.botao}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
