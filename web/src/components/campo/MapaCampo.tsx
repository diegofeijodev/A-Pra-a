'use client';

import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { irPara } from '@/modules/campo/application/use-tela';
import { useMapaPinosCampo } from '@/modules/pinos/application/use-pinos';
import { alternarCodigo, pinosVisiveis, SIMBOLO } from '@/modules/pinos/domain/pinos';
import type { StopView } from '@/modules/rotas/domain/rota.schema';
import { apiErrorMessage } from '@/modules/shared/infrastructure/http';

const PinosMapa = dynamic(() => import('@/components/praca/PinosMapa'), { ssr: false });

const chip = (ativo: boolean) =>
  `flex h-12 items-center gap-2 rounded-md border px-3 text-sm font-bold ${ativo ? 'border-primary bg-primary/15 text-foreground' : 'border-border text-muted-foreground line-through opacity-70'}`;

/**
 * Mapa do consultor no celular (UX §2.2, contrato §34.4): os estabelecimentos da praça dele que estão num roteiro dele ou que
 * ele visitou, com a situação de cada um (mesma legenda da equipe). Tocar num pino das paradas de hoje abre a parada. Precisa de
 * sinal: sem ele, a Lista continua funcionando.
 */
export function MapaCampo({ paradas, escuro }: { paradas: StopView[]; escuro: boolean }) {
  const mapa = useMapaPinosCampo(true);
  const [escondidos, setEscondidos] = useState<Set<string>>(new Set());
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const m = mapa.data;
  const cores = useMemo(() => Object.fromEntries((m?.legend ?? []).map((l) => [l.code, l.color])), [m]);
  const rotulo = useMemo(() => new Map((m?.legend ?? []).map((l) => [l.code, l.label])), [m]);
  const visiveis = useMemo(() => (m ? pinosVisiveis(m.pins, escondidos) : []), [m, escondidos]);
  const parada = selecionado ? paradas.find((s) => s.lead_id === selecionado) : undefined;
  const pino = selecionado && m ? m.pins.find((p) => p[0] === selecionado) : undefined;
  const linhas = pino ? [parada?.name ?? 'Estabelecimento', rotulo.get(pino[3]) ?? ''].filter(Boolean) : [];

  if (mapa.isError) {
    return (
      <div className="card-surface space-y-2 p-4">
        <p role="alert" className="text-sm text-destructive">
          {apiErrorMessage(mapa.error, 'Não foi possível carregar o mapa. Sem sinal, use a lista.')}
        </p>
        <Button variant="outline" className="h-12 w-full" onClick={() => void mapa.refetch()}>
          Tentar de novo
        </Button>
      </div>
    );
  }
  if (!m) return <div aria-busy="true" className="h-[55vh] animate-pulse rounded-lg bg-muted" />;
  if (m.total === 0) return <p className="card-surface p-4 text-sm">Nenhum estabelecimento seu com localização ainda. Eles aparecem aqui quando entram no seu roteiro.</p>;

  return (
    <div className="space-y-3">
      <PinosMapa pins={visiveis} cores={cores} dark={escuro} chaveEnquadre="campo" onPino={setSelecionado} balao={pino ? { leadId: pino[0], linhas } : null} />
      {pino && (
        <div className="card-surface flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
          <span className="min-w-0 break-words">{linhas.join(' · ')}</span>
          {parada && (
            <Button className="h-12" onClick={() => irPara({ v: 'parada', id: parada.id })}>
              Abrir a parada
            </Button>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-2" aria-live="polite">
        {m.legend.map((l) => {
          const visivel = !escondidos.has(l.code);
          return (
            <button key={l.code} type="button" aria-pressed={visivel} onClick={() => setEscondidos((e) => alternarCodigo(e, l.code))} className={chip(visivel)}>
              <span aria-hidden style={{ color: l.color }}>
                {SIMBOLO[l.shape]}
              </span>
              {l.label} {l.n.toLocaleString('pt-BR')}
            </button>
          );
        })}
      </div>
      <p className="text-sm text-muted-foreground">{m.without_location.toLocaleString('pt-BR')} sem localização não aparecem no mapa.</p>
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer py-2 text-sm">ⓘ Como contamos</summary>
        <p>{m.conta}</p>
      </details>
    </div>
  );
}

/** "Lista | Mapa" (UX §2.2): só com o mapa ligado no servidor (`features.map_pins` do `/me`). */
export function AlternarListaMapa({ modo, onModo }: { modo: 'lista' | 'mapa'; onModo: (m: 'lista' | 'mapa') => void }) {
  const aba = (ativa: boolean) => `flex h-12 flex-1 items-center justify-center rounded-md border text-sm font-bold ${ativa ? 'border-primary bg-primary/15' : 'border-border text-muted-foreground'}`;
  return (
    <div role="tablist" aria-label="Ver as paradas" className="flex gap-2">
      <button type="button" role="tab" aria-selected={modo === 'lista'} className={aba(modo === 'lista')} onClick={() => onModo('lista')}>
        Lista
      </button>
      <button type="button" role="tab" aria-selected={modo === 'mapa'} className={aba(modo === 'mapa')} onClick={() => onModo('mapa')}>
        Mapa
      </button>
    </div>
  );
}
