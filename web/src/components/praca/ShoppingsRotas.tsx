'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { RotaPlanoCard } from '@/components/praca/RotaPlanoCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/modules/auth/application/use-auth';
import { useConsultores } from '@/modules/consultores/application/use-consultores';
import { useSegmentos } from '@/modules/places/application/use-places';
import {
  useConfigShopping,
  useCriarPlano,
  useMarcarShopping,
  usePlano,
  usePlanos,
  useSalvarConfigShopping,
  useShoppings,
} from '@/modules/planos/application/use-planos';
import { textoCriterio, type BuscaShopping, type PlanSummary, type Shopping } from '@/modules/planos/domain/planos';
import { adicionarAchados, buscarShoppings, candidatosShopping, getBuscaShopping } from '@/modules/planos/infrastructure/planos.api';
import type { PracaView } from '@/modules/pracas/application/use-pracas';
import { apiErrorMessage } from '@/modules/shared/infrastructure/http';

const m2 = (x: number | null) => (x == null ? 'sem área (só um ponto no mapa)' : `${x.toLocaleString('pt-BR')} m²`);

/** Acompanha uma busca de shoppings/lojas a cada 2 s até terminar. */
function useBusca(id: string | null, pracaId: string) {
  return useQuery({
    queryKey: ['shoppings', 'busca', id],
    queryFn: () => getBuscaShopping(id!, pracaId),
    enabled: !!id,
    refetchInterval: (q) => {
      const s = (q.state.data as BuscaShopping | undefined)?.status;
      return s === 'queued' || s === 'running' ? 2000 : false;
    },
  });
}

/** Passo 1: "Descobrir shoppings da cidade" — busca no mapa aberto, revisão com "Incluir" e "Adicionar". */
function Descobrir({ praca, minimo }: { praca: PracaView; minimo: number }) {
  const qc = useQueryClient();
  const [runId, setRunId] = useState<string | null>(null);
  const [iniciando, setIniciando] = useState(false);
  const busca = useBusca(runId, praca.id);
  const pronta = busca.data?.status === 'done';
  const cands = useQuery({ queryKey: ['shoppings', 'achados', runId], queryFn: () => candidatosShopping(runId!, praca.id), enabled: !!runId && pronta });
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [adicionando, setAdicionando] = useState(false);
  useEffect(() => {
    // Marcados por padrão: os novos com área ≥ o mínimo do critério (a marcação à mão decide depois).
    if (cands.data) setMarcados(new Set(cands.data.filter((c) => c.selectable && (c.metrics?.area_m2 ?? 0) >= minimo).map((c) => c.id)));
  }, [cands.data, minimo]);

  async function descobrir() {
    setIniciando(true);
    try {
      const r = await buscarShoppings({ praca_id: praca.id, kind: 'shoppings' });
      setRunId(r.id);
    } catch (e) {
      toast.error(apiErrorMessage(e, 'Não conseguimos buscar os shoppings agora.'));
    } finally {
      setIniciando(false);
    }
  }

  async function adicionar() {
    if (!runId) return;
    setAdicionando(true);
    try {
      const r = await adicionarAchados(runId, praca.id, [...marcados]);
      toast.success(`${r.created} ${r.created === 1 ? 'shopping adicionado' : 'shoppings adicionados'} à praça.`);
      setRunId(null);
      void qc.invalidateQueries({ queryKey: ['shoppings'] });
    } catch (e) {
      toast.error(apiErrorMessage(e, 'Não conseguimos adicionar agora.'));
    } finally {
      setAdicionando(false);
    }
  }

  const novos = (cands.data ?? []).filter((c) => c.selectable);
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button className="h-12" disabled={iniciando || busca.data?.status === 'running' || busca.data?.status === 'queued'} onClick={() => void descobrir()}>
          {busca.data?.status === 'running' || busca.data?.status === 'queued' ? 'Buscando no mapa aberto…' : 'Descobrir shoppings da cidade'}
        </Button>
        <span className="text-sm text-muted-foreground">Mapa aberto (OpenStreetMap), sem custo; até 15 km do centro da praça.</span>
      </div>
      {busca.data?.status === 'error' && <p role="alert" className="text-sm">{busca.data.error}</p>}
      {pronta && cands.data && (
        <div className="space-y-2">
          <p className="text-sm">
            {busca.data!.found} achados: {busca.data!.novos} novos, {busca.data!.duplicados} já na praça, {busca.data!.descartados} sem nome ou fechados.
          </p>
          <ul className="space-y-1">
            {novos.map((c) => (
              <li key={c.id}>
                <label className="flex min-h-12 items-center gap-3 rounded-md border border-border px-3 text-sm">
                  <input
                    type="checkbox"
                    className="h-5 w-5"
                    checked={marcados.has(c.id)}
                    onChange={() => setMarcados((s) => (s.has(c.id) ? new Set([...s].filter((x) => x !== c.id)) : new Set([...s, c.id])))}
                  />
                  <span className="flex-1">
                    <strong>{c.name}</strong> <span className="text-muted-foreground">· {m2(c.metrics?.area_m2 ?? null)}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {novos.length > 0 && (
            <Button className="h-12" disabled={adicionando || marcados.size === 0} onClick={() => void adicionar()}>
              {adicionando ? 'Adicionando…' : `Adicionar ${marcados.size} ${marcados.size === 1 ? 'shopping' : 'shoppings'}`}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/** Passo 2 de um shopping: buscar as lojas de dentro com os segmentos escolhidos e adicioná-las. */
function LojasDoShopping({ praca, s, tipos }: { praca: PracaView; s: Shopping; tipos: string[] }) {
  const qc = useQueryClient();
  const [runId, setRunId] = useState<string | null>(null);
  const busca = useBusca(runId, praca.id);
  const pronta = busca.data?.status === 'done';
  const cands = useQuery({ queryKey: ['shoppings', 'lojas', runId], queryFn: () => candidatosShopping(runId!, praca.id), enabled: !!runId && pronta });
  const novos = (cands.data ?? []).filter((c) => c.selectable);
  const [ocupado, setOcupado] = useState(false);

  async function buscar() {
    setOcupado(true);
    try {
      const r = await buscarShoppings({ praca_id: praca.id, kind: 'lojas', parent_lead_id: s.lead_id, types: tipos });
      setRunId(r.id);
    } catch (e) {
      toast.error(apiErrorMessage(e, 'Não conseguimos buscar as lojas agora.'));
    } finally {
      setOcupado(false);
    }
  }
  async function adicionar() {
    if (!runId) return;
    setOcupado(true);
    try {
      const r = await adicionarAchados(runId, praca.id, novos.map((c) => c.id));
      toast.success(`${r.created} ${r.created === 1 ? 'loja adicionada' : 'lojas adicionadas'} ao ${s.name}.`);
      setRunId(null);
      void qc.invalidateQueries({ queryKey: ['shoppings'] });
    } catch (e) {
      toast.error(apiErrorMessage(e, 'Não conseguimos adicionar agora.'));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="space-y-1 text-sm">
      <Button variant="outline" className="h-12" disabled={ocupado || tipos.length === 0 || busca.data?.status === 'running' || busca.data?.status === 'queued'} onClick={() => void buscar()}>
        {busca.data?.status === 'running' || busca.data?.status === 'queued' ? 'Buscando lojas…' : `Buscar lojas dentro do ${s.name}`}
      </Button>
      {pronta && cands.data && (
        <p>
          {novos.length} {novos.length === 1 ? 'loja nova' : 'lojas novas'} no mapa aberto ({busca.data!.duplicados} já na praça).{' '}
          {novos.length > 0 && (
            <Button className="ml-1 h-12" disabled={ocupado} onClick={() => void adicionar()}>
              Adicionar as {novos.length}
            </Button>
          )}
        </p>
      )}
      {busca.data?.status === 'error' && <p role="alert">{busca.data.error}</p>}
    </div>
  );
}

function UltimoPlano({ planos, admin, consultores }: { planos: PlanSummary[] | undefined; admin: boolean; consultores: { id: string; name: string }[] }) {
  const p = usePlano(planos?.[0]?.id ?? null);
  if (!p.data) return null;
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {p.data.items.map((it) => (
        <RotaPlanoCard key={it.id} plano={p.data!} item={it} admin={admin} consultores={consultores} />
      ))}
    </div>
  );
}

/**
 * Rotas > "Shoppings" (contrato §40, UX §3.7; Lovable `rotas.tsx`, aba Shoppings): três passos explícitos — descobrir os
 * shoppings (mapa aberto, critério de "grande" editável com a marcação à mão), buscar as lojas de dentro com os segmentos
 * como perfil e gerar a rota dos shoppings e uma rota "Dentro do X" por shopping, publicadas como em "Dividir em rotas".
 */
export function ShoppingsRotas({ praca }: { praca: PracaView }) {
  const { user } = useAuth();
  const admin = !!user?.is_admin;
  const lista = useShoppings(praca.id, true);
  const config = useConfigShopping(true);
  const salvarConfig = useSalvarConfigShopping();
  const marcar = useMarcarShopping();
  const segmentos = useSegmentos(admin);
  const ativos = (segmentos.data?.segments ?? []).filter((s) => s.active);
  const [tipos, setTipos] = useState<string[]>(['bar', 'restaurante']);
  const [minimo, setMinimo] = useState<number | null>(null);
  const cfg = config.data ?? lista.data?.config;
  const criar = useCriarPlano();
  const planosShop = usePlanos(praca.id, 'shoppings', true);
  const { data: consultores } = useConsultores();
  const doPraca = (consultores ?? []).filter((c) => c.praca_id === praca.id && c.active).map((c) => ({ id: c.id, name: c.name }));
  const shoppings = lista.data?.shoppings ?? [];
  const grandes = shoppings.filter((s) => s.is_large);

  return (
    <div className="space-y-4">
      <section className="card-surface space-y-3 p-4" aria-label="Descobrir shoppings">
        <h2 className="text-base font-bold">1. Shoppings da cidade</h2>
        {cfg && (
          <p className="text-sm text-muted-foreground" data-testid="criterio-shopping">
            ⓘ {textoCriterio(cfg)}
          </p>
        )}
        {admin && cfg && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="space-y-1">
              <Label htmlFor="shop-min">Área mínima de um shopping grande (m²)</Label>
              <Input id="shop-min" type="number" min={1000} max={1000000} step={1000} value={minimo ?? cfg.area_min_m2} onChange={(e) => setMinimo(Number(e.target.value) || 1000)} className="h-12" />
            </div>
            <Button
              variant="outline"
              className="h-12"
              disabled={salvarConfig.isPending || minimo === null || minimo === cfg.area_min_m2}
              onClick={() => salvarConfig.mutate({ area_min_m2: minimo! }, { onSuccess: () => setMinimo(null) })}
            >
              Salvar critério
            </Button>
          </div>
        )}
        {admin && <Descobrir praca={praca} minimo={cfg?.area_min_m2 ?? 20000} />}
        {lista.data && shoppings.length === 0 && <p className="text-sm text-muted-foreground">Nenhum shopping cadastrado nesta praça ainda.</p>}
        {shoppings.length > 0 && (
          <ul className="space-y-2">
            {shoppings.map((s) => (
              <li key={s.lead_id} className="rounded-md border border-border p-3 text-sm">
                <p>
                  <strong>{s.name}</strong> · {m2(s.area_m2)} · {s.pois_mapped == null ? 'lojas no mapa: ainda não contadas' : `${s.pois_mapped} lojas no mapa`} · {s.stores} lojas cadastradas
                </p>
                <p className={s.is_large ? 'font-semibold' : 'text-muted-foreground'}>
                  {s.is_large ? '✓ Grande' : '— Não grande'}: {s.conta}
                </p>
                {admin && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {[
                      { v: true, t: 'Marcar como grande' },
                      { v: false, t: 'Marcar como não grande' },
                      { v: null, t: 'Seguir o critério' },
                    ].map((o) => (
                      <Button
                        key={String(o.v)}
                        variant={s.large_override === o.v ? 'default' : 'outline'}
                        className="h-12"
                        aria-pressed={s.large_override === o.v}
                        disabled={marcar.isPending}
                        onClick={() => marcar.mutate({ leadId: s.lead_id, large_override: o.v })}
                      >
                        {o.t}
                      </Button>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {admin && grandes.length > 0 && (
        <section className="card-surface space-y-3 p-4" aria-label="Lojas dentro dos shoppings">
          <h2 className="text-base font-bold">2. Lojas lá dentro</h2>
          <fieldset className="space-y-1">
            <legend className="text-sm">Que lojas buscar (segmentos da busca)</legend>
            <div className="flex flex-wrap gap-2">
              {ativos.map((sg) => {
                const on = tipos.includes(sg.slug);
                return (
                  <Button
                    key={sg.slug}
                    variant={on ? 'default' : 'outline'}
                    className="h-12"
                    aria-pressed={on}
                    onClick={() => setTipos(on ? tipos.filter((t) => t !== sg.slug) : [...tipos, sg.slug].slice(0, 10))}
                  >
                    {sg.label}
                  </Button>
                );
              })}
            </div>
          </fieldset>
          {grandes.map((s) => (
            <LojasDoShopping key={s.lead_id} praca={praca} s={s} tipos={tipos.filter((t) => ativos.some((a) => a.slug === t))} />
          ))}
          <p className="text-sm text-muted-foreground">
            Dentro do polígono do shopping no mapa aberto; sem resultado (ou shopping só como ponto), em volta até {cfg?.raio_lojas_m ?? 300} m — menos confiável.
          </p>
        </section>
      )}

      <section className="card-surface space-y-3 p-4" aria-label="Rotas dos shoppings">
        <h2 className="text-base font-bold">3. Rotas</h2>
        {admin && (
          <div className="flex flex-col flex-wrap gap-2 sm:flex-row">
            <Button className="h-12" disabled={criar.isPending || grandes.length === 0} onClick={() => criar.mutate({ praca_id: praca.id, kind: 'shoppings', travel_mode: 'carro' })}>
              Gerar a rota dos {grandes.length} {grandes.length === 1 ? 'shopping grande' : 'shoppings grandes'}
            </Button>
            {grandes
              .filter((s) => s.stores > 0)
              .map((s) => (
                <Button
                  key={s.lead_id}
                  variant="outline"
                  className="h-12"
                  disabled={criar.isPending}
                  onClick={() => criar.mutate({ praca_id: praca.id, kind: 'shopping_interno', parent_lead_id: s.lead_id, travel_mode: 'a_pe' })}
                >
                  Gerar a rota dentro do {s.name} ({s.stores})
                </Button>
              ))}
          </div>
        )}
        <UltimoPlano planos={planosShop.data} admin={admin} consultores={doPraca} />
        <PlanosInternos pracaId={praca.id} admin={admin} consultores={doPraca} />
        {planosShop.data?.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma rota de shopping gerada ainda.</p>}
      </section>
    </div>
  );
}

function PlanosInternos({ pracaId, admin, consultores }: { pracaId: string; admin: boolean; consultores: { id: string; name: string }[] }) {
  const internos = usePlanos(pracaId, 'shopping_interno', true);
  // Um por shopping: a geração mais nova de cada.
  const porShopping = new Map<string, PlanSummary>();
  for (const p of internos.data ?? []) if (p.parent_lead_id && !porShopping.has(p.parent_lead_id)) porShopping.set(p.parent_lead_id, p);
  return (
    <>
      {[...porShopping.values()].map((p) => (
        <UltimoPlano key={p.id} planos={[p]} admin={admin} consultores={consultores} />
      ))}
    </>
  );
}
