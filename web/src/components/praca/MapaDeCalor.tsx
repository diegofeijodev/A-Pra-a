'use client';

import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { todaySp } from '@/lib/dates';
import { useAreas } from '@/modules/areas/application/use-areas';
import { visaoInicial } from '@/modules/areas/domain/area-form';
import { useCalor } from '@/modules/calor/application/use-calor';
import {
  AVISO_PASSAGEM,
  CAMADAS,
  PRESETS,
  celulaPorZoom,
  degradeDaLegenda,
  erroDoPeriodo,
  filtrosParaQuery,
  fmtN,
  lerFiltros,
  periodoDoPreset,
  plural,
  presetDoPeriodo,
  quadrasMaisIntensas,
  rotuloPeriodo,
  textoLegenda,
  type Camada,
  type Filtros,
} from '@/modules/calor/domain/calor';
import type { HeatmapView } from '@/modules/calor/infrastructure/calor.api';
import { useConsultores } from '@/modules/consultores/application/use-consultores';
import { useActivePraca, usePracas } from '@/modules/pracas/application/use-pracas';
import { apiErrorMessage } from '@/modules/shared/infrastructure/http';
import type { VistaMapa } from './CalorMapa';
import { atuaNaPraca } from '@/modules/consultores/domain/pracas';

// O Leaflet só existe no navegador — o mapa entra por import dinâmico.
const CalorMapa = dynamic(() => import('./CalorMapa'), { ssr: false });

const selectCls = 'h-9 rounded-md border border-input bg-background px-2 text-sm outline-none focus:border-primary';

/**
 * `/consultores/calor` — onde a equipe passou e onde falta visitar (UX §5.3, contrato §24).
 * Filtros na URL (compartilháveis). Uma camada por vez: o servidor agrega por camada em grade.
 */
export function MapaDeCalor() {
  const router = useRouter();
  const params = useSearchParams();
  const hoje = todaySp();
  const f = useMemo(() => lerFiltros(params, hoje), [params, hoje]);
  const { praca: ativa, isPending: carregandoPracas } = useActivePraca();
  const { data: pracas } = usePracas();
  const praca = pracas?.find((p) => p.id === f.praca) ?? ativa;
  const { data: consultores } = useConsultores();
  const { data: areas } = useAreas(praca?.id);
  const consultoresDaPraca = useMemo(() => (consultores ?? []).filter((c) => atuaNaPraca(c, praca?.id)), [consultores, praca?.id]);
  const consultor = consultoresDaPraca.some((c) => c.id === f.consultor) ? f.consultor : null;

  const [vista, setVista] = useState<VistaMapa | null>(null);
  const [de, setDe] = useState<string | null>(null);
  const [ate, setAte] = useState<string | null>(null);
  const deAtual = de ?? f.from;
  const ateAtual = ate ?? f.to;
  const erroPeriodo = erroDoPeriodo(deAtual, ateAtual);

  const mudar = useCallback(
    (novo: Partial<Filtros>) => {
      const prox: Filtros = { ...f, praca: praca?.id ?? null, consultor, ...novo };
      setVista(null); // outro filtro = recomeça sem o recorte do mapa
      setDe(null);
      setAte(null);
      router.replace(`/consultores/calor?${filtrosParaQuery(prox)}`);
    },
    [f, praca?.id, consultor, router],
  );

  const consulta = useCalor(
    praca && !erroPeriodo
      ? {
          praca_id: praca.id,
          layer: f.camada,
          from: f.from,
          to: f.to,
          consultant_id: f.camada === 'cobertura' ? null : consultor,
          cell_m: vista ? celulaPorZoom(vista.zoom) : undefined,
          bbox: vista?.bbox ?? null,
        }
      : null,
  );
  const dados = consulta.data;
  const inicio = useMemo(() => (praca ? visaoInicial({ cobertura: praca.cobertura }, areas ?? []) : { center: [-14.2, -51.9] as [number, number], zoom: 4 }), [praca, areas]);
  const chaveEnquadre = `${praca?.id}|${f.camada}|${consultor}|${f.from}|${f.to}`;
  const preset = presetDoPeriodo(f.from, f.to, hoje);

  if (carregandoPracas) return <p className="mt-4 text-sm text-muted-foreground">Carregando…</p>;
  if (!praca) return <p className="mt-4 text-sm text-muted-foreground">Nenhuma praça ainda. Crie uma em Praça para ver o mapa de calor.</p>;

  return (
    <div className="mt-4 space-y-4">
      <section aria-label="Filtros" className="card-surface space-y-3 p-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-muted-foreground">
            <span className="block">Praça</span>
            <select className={selectCls} value={praca.id} onChange={(e) => mudar({ praca: e.target.value, consultor: null })}>
              {(pracas ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-muted-foreground">
            <span className="block">Consultor</span>
            <select
              className={selectCls}
              value={consultor ?? ''}
              disabled={f.camada === 'cobertura'}
              onChange={(e) => mudar({ consultor: e.target.value || null })}
            >
              <option value="">Todos</option>
              {consultoresDaPraca.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.active ? '' : ' (desativado)'}
                </option>
              ))}
            </select>
          </label>
          <div className="text-xs text-muted-foreground">
            <span className="block">Período</span>
            <div className="mt-0.5 flex flex-wrap gap-1" role="group" aria-label="Período">
              {PRESETS.map((p) => (
                <Button key={p.id} size="sm" variant={preset === p.id ? 'default' : 'outline'} aria-pressed={preset === p.id} onClick={() => mudar(periodoDoPreset(p.id, hoje))}>
                  {p.rotulo}
                </Button>
              ))}
            </div>
          </div>
          <label className="text-xs text-muted-foreground">
            <span className="block">De</span>
            <input type="date" className={selectCls} value={deAtual} max={ateAtual} onChange={(e) => setDe(e.target.value)} />
          </label>
          <label className="text-xs text-muted-foreground">
            <span className="block">Até</span>
            <input type="date" className={selectCls} value={ateAtual} min={deAtual} onChange={(e) => setAte(e.target.value)} />
          </label>
          <Button size="sm" variant="outline" disabled={!!erroPeriodo || (deAtual === f.from && ateAtual === f.to)} onClick={() => mudar({ from: deAtual, to: ateAtual })}>
            Aplicar datas
          </Button>
        </div>
        {erroPeriodo && (
          <p role="alert" className="text-xs text-destructive">
            {erroPeriodo}
          </p>
        )}
        <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <legend className="sr-only">Mostrar</legend>
          <span className="text-xs text-muted-foreground">Mostrar</span>
          {CAMADAS.map((c) => (
            <label key={c.id} className="flex cursor-pointer items-center gap-1.5 text-sm">
              <input type="radio" name="camada" checked={f.camada === c.id} onChange={() => mudar({ camada: c.id as Camada })} className="accent-[var(--primary)]" />
              {c.rotulo}
            </label>
          ))}
        </fieldset>
        {f.camada === 'cobertura' && <p className="text-xs text-muted-foreground">Em “Falta visitar” conta a visita de qualquer consultor da praça: o filtro de consultor não vale aqui.</p>}
      </section>

      <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground" data-testid="aviso-calor">
        {AVISO_PASSAGEM}
      </p>

      {consulta.isError && !dados ? (
        <div className="space-y-2">
          <p role="alert" className="text-sm text-destructive">
            {apiErrorMessage(consulta.error, 'Não conseguimos carregar o mapa.')}
          </p>
          <Button variant="outline" onClick={() => void consulta.refetch()}>
            Tentar de novo
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
          <div className="space-y-3">
            <div className="relative">
              <CalorMapa
                camada={f.camada}
                cells={dados?.cells ?? []}
                cell={dados?.cell ?? { dlat: 0, dlng: 0 }}
                max={dados?.max ?? 0}
                dark={false}
                inicio={inicio}
                chaveEnquadre={chaveEnquadre}
                onVista={setVista}
              />
              {consulta.isLoading && (
                <div className="absolute inset-0 flex items-center justify-center rounded-md bg-background/70 text-sm text-muted-foreground" role="status">
                  Carregando pontos…
                </div>
              )}
              {dados && dados.cells.length === 0 && !consulta.isFetching && (
                <div className="pointer-events-none absolute inset-x-4 top-4 rounded-md border border-border bg-background/90 px-3 py-2 text-sm">{mensagemVazia(f.camada)}</div>
              )}
            </div>
            {consulta.isError && dados && (
              <p role="alert" className="text-xs text-destructive">
                Não conseguimos atualizar o mapa.{' '}
                <button className="underline" onClick={() => void consulta.refetch()}>
                  Tentar de novo
                </button>
              </p>
            )}
            {dados && <Legenda dados={dados} dark={false} />}
            {dados && dados.cells.length > 0 && <Quadras dados={dados} />}
          </div>
          <Resumo dados={dados} />
        </div>
      )}
    </div>
  );
}

function mensagemVazia(c: Camada): string {
  if (c === 'cobertura') return 'Nenhum estabelecimento com localização precisa nesse recorte, ou todos já foram visitados. Escolha outro período ou área.';
  if (c === 'passagem') return 'Nenhum registro de trajeto nesse período. Escolha outro período ou consultor.';
  return 'Nenhuma visita nesse período. Escolha outro período ou consultor.';
}

function Legenda({ dados, dark }: { dados: HeatmapView; dark: boolean }) {
  return (
    <section aria-label="Legenda" className="space-y-1.5 text-xs">
      <div className="h-3 w-full max-w-xs rounded-sm border border-border" style={{ backgroundImage: degradeDaLegenda(dark) }} aria-hidden />
      <div className="flex max-w-xs justify-between text-muted-foreground">
        <span>poucos</span>
        <span>alguns</span>
        <span>muitos</span>
      </div>
      <p className="text-muted-foreground">{textoLegenda(dados.layer, dados.cell.m, dados.max)}</p>
      {dados.cell.m !== dados.requested_cell_m && <p className="text-muted-foreground">Quadras maiores que o pedido, porque havia pontos demais para desenhar.</p>}
      {dados.truncated && <p className="text-warning">Mostrando só as 5.000 quadras mais fortes. Aproxime o mapa ou escolha um período menor.</p>}
    </section>
  );
}

function Quadras({ dados }: { dados: HeatmapView }) {
  const linhas = quadrasMaisIntensas(dados.cells, dados.layer);
  return (
    <details className="text-sm" open>
      <summary className="cursor-pointer font-bold">Quadras com mais {dados.layer === 'cobertura' ? 'estabelecimentos sem visita' : dados.layer === 'visitas' ? 'visitas' : 'pontos de trajeto'}</summary>
      <table className="mt-2 w-full text-left text-xs">
        <caption className="sr-only">As 10 quadras mais fortes do mapa, com a posição aproximada do centro de cada uma.</caption>
        <thead className="text-muted-foreground">
          <tr>
            <th scope="col" className="py-1 pr-2 font-normal">
              #
            </th>
            <th scope="col" className="py-1 pr-2 font-normal">
              Centro da quadra (lat, lng)
            </th>
            <th scope="col" className="py-1 font-normal">
              Valor
            </th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.pos} className="border-t border-border">
              <td className="py-1 pr-2">{l.pos}</td>
              <td className="py-1 pr-2 tabular-nums">{l.ref}</td>
              <td className="py-1">{l.texto}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

function Resumo({ dados }: { dados: HeatmapView | undefined }) {
  if (!dados) return <aside className="card-surface h-40 animate-pulse p-4" aria-hidden />;
  const periodo = rotuloPeriodo(dados.from, dados.to);
  return (
    <aside className="card-surface space-y-2 p-4 text-sm" aria-label="Resumo">
      <h2 className="text-sm font-bold">Resumo ({periodo})</h2>
      {dados.layer === 'cobertura' && (
        <>
          <p>
            <strong>
              {fmtN(dados.summary.leads_visited)} de {fmtN(dados.summary.leads_total)}
            </strong>{' '}
            estabelecimentos já visitados ({dados.summary.percent}%).
          </p>
          <p className="text-xs text-muted-foreground">
            Conta: {fmtN(dados.summary.leads_visited)} ÷ {fmtN(dados.summary.leads_total)} = {dados.summary.percent}%. Entram os estabelecimentos da praça com localização precisa, ativos e com ao menos 1 visita entre{' '}
            {periodo}. Faltam {fmtN(dados.summary.leads_missing)}.
          </p>
        </>
      )}
      {dados.layer === 'visitas' && (
        <>
          <p>
            <strong>{plural(dados.summary.visits, 'visita feita', 'visitas feitas')}</strong> em {plural(dados.summary.leads, 'estabelecimento', 'estabelecimentos')}.
          </p>
          <p className="text-xs text-muted-foreground">Conta: cada check-in do período é uma visita; o mesmo estabelecimento visitado duas vezes conta duas visitas e um estabelecimento.</p>
          {dados.summary.consultants.length > 0 && (
            <>
              <h3 className="pt-1 text-xs font-bold">Por consultor</h3>
              <ul className="space-y-0.5 text-xs">
                {dados.summary.consultants.map((c) => (
                  <li key={c.id} className="flex justify-between gap-2">
                    <span className="truncate">{c.name}</span>
                    <span className="tabular-nums">{plural(c.visits, 'visita', 'visitas')}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
      {dados.layer === 'passagem' && (
        <>
          <p>
            <strong>{plural(dados.summary.points, 'ponto gravado', 'pontos gravados')}</strong>, cerca de {fmtN(dados.summary.minutes)} min com a tela aberta.
          </p>
          <p className="text-xs text-muted-foreground">Conta: pontos de trajeto (um a cada ~5 min) × 5 min. É uma estimativa, não o tempo de rua.</p>
        </>
      )}
    </aside>
  );
}
