'use client';

import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useUiStore } from '@/lib/ui-store';
import { useAuth } from '@/modules/auth/application/use-auth';
import { useFeaturesLovable, useConfigLovable } from '@/modules/painel/application/use-painel';
import { useDetalhePino, useMapaPinos } from '@/modules/pinos/application/use-pinos';
import { alternarCodigo, linhasDoBalao, pinosVisiveis, SIMBOLO, type ModoMapa } from '@/modules/pinos/domain/pinos';
import { usePracas } from '@/modules/pracas/application/use-pracas';
import { apiErrorMessage } from '@/modules/shared/infrastructure/http';

const PinosMapa = dynamic(() => import('@/components/praca/PinosMapa'), { ssr: false });

const chip = (ativo: boolean) =>
  `flex h-12 items-center gap-2 rounded-md border px-3 text-sm font-bold ${ativo ? 'border-primary bg-primary/15 text-foreground' : 'border-border text-muted-foreground'}`;

/** Mapa por situação (contrato §34, UX §3.3; Lovable `mapa.tsx`): filtro por praça, legenda clicável com contagem. */
export function MapaSituacao() {
  const { user } = useAuth();
  const dark = user?.theme !== 'light';
  const cfg = useConfigLovable();
  const features = useFeaturesLovable();
  const { data: todasPracas } = usePracas();
  const [pracaId, setPracaId] = useState('');
  const [modo, setModo] = useState<ModoMapa>('resultado');
  const [escondidos, setEscondidos] = useState<Set<string>>(new Set());
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const abrirLead = useUiStore((s) => s.openLead);
  const mapa = useMapaPinos({ praca_id: pracaId || undefined, mode: modo }, features.map_pins);
  const detalhe = useDetalhePino(selecionado);
  const m = mapa.data;
  const cores = useMemo(() => Object.fromEntries((m?.legend ?? []).map((l) => [l.code, l.color])), [m]);
  const visiveis = useMemo(() => (m ? pinosVisiveis(m.pins, escondidos) : []), [m, escondidos]);
  const balao = selecionado && detalhe.data?.id === selecionado ? { leadId: selecionado, linhas: linhasDoBalao(detalhe.data) } : null;

  if (cfg.isPending) return <div aria-busy="true" className="mt-4 h-40 animate-pulse rounded-lg bg-muted" />;
  if (!features.map_pins) return <p className="card-surface mt-4 p-4 text-sm">Este recurso ainda não está ligado neste servidor.</p>;

  return (
    <div className="mt-2 space-y-3">
      <p className="text-sm text-muted-foreground">
        {pracaId ? 'Estabelecimentos da praça escolhida.' : 'Praças abertas (início até hoje).'} Cor e símbolo mostram a situação de cada estabelecimento.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="mapa-praca" className="sr-only">
          Praça
        </label>
        <select id="mapa-praca" value={pracaId} onChange={(e) => { setPracaId(e.target.value); setEscondidos(new Set()); }} className="h-12 min-w-40 rounded-md border border-border bg-background px-3 text-sm">
          <option value="">Todas as praças abertas</option>
          {(todasPracas ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <div role="group" aria-label="Cor dos pinos" className="flex gap-2">
          <button type="button" aria-pressed={modo === 'resultado'} onClick={() => { setModo('resultado'); setEscondidos(new Set()); }} className={chip(modo === 'resultado')}>
            Situação
          </button>
          <button type="button" aria-pressed={modo === 'estagio'} onClick={() => { setModo('estagio'); setEscondidos(new Set()); }} className={chip(modo === 'estagio')}>
            Etapa do funil
          </button>
        </div>
      </div>

      {mapa.isError ? (
        <div className="card-surface space-y-2 p-4">
          <p role="alert" className="text-sm text-destructive">
            {apiErrorMessage(mapa.error, 'Não foi possível carregar o mapa.')}
          </p>
          <Button variant="outline" className="h-12" onClick={() => void mapa.refetch()}>
            Tentar de novo
          </Button>
        </div>
      ) : !m ? (
        <div aria-busy="true" className="h-[55vh] animate-pulse rounded-lg bg-muted" />
      ) : (
        <>
          <div>
            <p className="mb-1 text-sm font-bold">Situação (toque para esconder ou mostrar):</p>
            <div className="flex flex-wrap gap-2" aria-live="polite">
              {m.legend.map((l) => {
                const visivel = !escondidos.has(l.code);
                return (
                  <button key={l.code} type="button" aria-pressed={visivel} onClick={() => setEscondidos((e) => alternarCodigo(e, l.code))} className={`${chip(visivel)} ${visivel ? '' : 'line-through opacity-70'}`}>
                    <span aria-hidden style={{ color: l.color }}>
                      {SIMBOLO[l.shape]}
                    </span>
                    {l.label} {l.n.toLocaleString('pt-BR')}
                  </button>
                );
              })}
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            {m.without_location.toLocaleString('pt-BR')} sem localização não aparecem no mapa.
            {m.truncado ? ` Mostrando ${m.pins.length.toLocaleString('pt-BR')} de ${m.total.toLocaleString('pt-BR')}: escolha uma praça para ver todos.` : ''}
          </p>
          <PinosMapa pins={visiveis} cores={cores} dark={dark} chaveEnquadre={`${pracaId}|${modo}`} onPino={setSelecionado} balao={balao} />
          {selecionado && detalhe.data?.id === selecionado && (
            <div className="card-surface flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
              <span className="min-w-0 break-words">{linhasDoBalao(detalhe.data).slice(0, 2).join(' · ')}</span>
              <Button variant="outline" className="h-12" onClick={() => abrirLead(detalhe.data!.id)}>
                Abrir no funil
              </Button>
            </div>
          )}
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer py-2 text-sm">ⓘ Como contamos</summary>
            <p>{m.conta}</p>
          </details>
        </>
      )}
    </div>
  );
}
