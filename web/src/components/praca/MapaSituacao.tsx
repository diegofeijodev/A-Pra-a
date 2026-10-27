'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { todaySp } from '@/lib/dates';
import { useUiStore } from '@/lib/ui-store';
import { useFeaturesMenu } from '@/modules/acesso/application/use-acesso';
import { ROTA } from '@/modules/acesso/domain/enderecos';
import { useFeaturesLovable, useConfigLovable } from '@/modules/painel/application/use-painel';
import { useDetalhePino, useMapaPinos } from '@/modules/pinos/application/use-pinos';
import { alternarCodigo, linhasDoBalao, pinosVisiveis, SIMBOLO, type ModoMapa } from '@/modules/pinos/domain/pinos';
import { usePracas } from '@/modules/pracas/application/use-pracas';
import { pracasAbertas } from '@/modules/pracas/domain/status-praca';
import { apiErrorMessage } from '@/modules/shared/infrastructure/http';

const PinosMapa = dynamic(() => import('@/components/praca/PinosMapa'), { ssr: false });

const CARTAO = 'rounded-2xl bg-card shadow-card';
/** Pílula de praça da Lovable (`Chip`): a escolhida em `bg-primary`. */
const chip = (ativo: boolean) =>
  `min-h-11 rounded-full border px-3 py-1 text-sm md:min-h-9 ${ativo ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card'}`;

/**
 * Mapa (Lovable `mapa.tsx`, UX §4.5, contrato §34): pílulas de praça ("Todas ({n})" + uma por praça ABERTA, pelas datas), legenda
 * clicável com a contagem (escondida = `opacity-40`; cor sempre com o símbolo [desvio: WCAG 1.4.1]) e o nosso Leaflet com o mapa aberto
 * (a chave do Google no navegador fica fora). "Situação | Etapa do funil" só com a chave do Comercial.
 */
export function MapaSituacao() {
  const cfg = useConfigLovable();
  const features = useFeaturesLovable();
  const { features: menu } = useFeaturesMenu();
  const { data: todasPracas, isPending: pracasPendentes } = usePracas();
  const abertas = useMemo(() => pracasAbertas(todasPracas ?? [], todaySp()), [todasPracas]);
  const [pracaId, setPracaId] = useState('');
  const [modoEscolhido, setModo] = useState<ModoMapa>('resultado');
  const modo: ModoMapa = menu.commercial ? modoEscolhido : 'resultado';
  const [escondidos, setEscondidos] = useState<Set<string>>(new Set());
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const abrirLead = useUiStore((s) => s.openLead);
  const mapa = useMapaPinos({ praca_id: pracaId || undefined, mode: modo }, features.map_pins && abertas.length > 0);
  const detalhe = useDetalhePino(selecionado);
  const m = mapa.data;
  const cores = useMemo(() => Object.fromEntries((m?.legend ?? []).map((l) => [l.code, l.color])), [m]);
  const visiveis = useMemo(() => (m ? pinosVisiveis(m.pins, escondidos) : []), [m, escondidos]);
  const balao = selecionado && detalhe.data?.id === selecionado ? { leadId: selecionado, linhas: linhasDoBalao(detalhe.data) } : null;
  const escolherPraca = (id: string) => {
    setPracaId(id);
    setEscondidos(new Set());
  };
  const escolherModo = (x: ModoMapa) => {
    setModo(x);
    setEscondidos(new Set());
  };

  if (cfg.isPending || pracasPendentes) return <div aria-busy="true" className="h-[60vh] animate-pulse rounded-2xl bg-muted md:h-[620px]" />;
  if (!features.map_pins) return <p className={`${CARTAO} p-5 text-sm`}>Este recurso ainda não está ligado neste servidor.</p>;
  if (abertas.length === 0) {
    return (
      <div className={`${CARTAO} p-10 text-center text-muted-foreground`}>
        Nenhuma praça aberta ainda. Uma praça abre na data de início dela: veja em{' '}
        <Link href={ROTA.pracas} className="text-primary underline">
          Praças
        </Link>
        .
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Praça">
        <button type="button" aria-pressed={!pracaId} onClick={() => escolherPraca('')} className={chip(!pracaId)}>
          Todas ({abertas.length})
        </button>
        {abertas.map((p) => (
          <button key={p.id} type="button" aria-pressed={pracaId === p.id} onClick={() => escolherPraca(p.id)} className={chip(pracaId === p.id)}>
            {p.name}
          </button>
        ))}
      </div>
      {menu.commercial && (
        <div role="group" aria-label="Cor dos pinos" className="flex flex-wrap gap-2">
          <button type="button" aria-pressed={modo === 'resultado'} onClick={() => escolherModo('resultado')} className={chip(modo === 'resultado')}>
            Situação
          </button>
          <button type="button" aria-pressed={modo === 'estagio'} onClick={() => escolherModo('estagio')} className={chip(modo === 'estagio')}>
            Etapa do funil
          </button>
        </div>
      )}

      {mapa.isError ? (
        <div className={`${CARTAO} space-y-2 p-5`}>
          <p role="alert" className="text-sm text-destructive">
            {apiErrorMessage(mapa.error, 'Não foi possível carregar o mapa.')}
          </p>
          <Button variant="outline" onClick={() => void mapa.refetch()}>
            Tentar de novo
          </Button>
        </div>
      ) : !m ? (
        <div aria-busy="true" className="h-[60vh] animate-pulse rounded-2xl bg-muted md:h-[620px]" />
      ) : (
        <>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Mostrar ou esconder por situação" aria-live="polite">
            {m.legend.map((l) => {
              const visivel = !escondidos.has(l.code);
              return (
                <button
                  key={l.code}
                  type="button"
                  aria-pressed={visivel}
                  onClick={() => setEscondidos((e) => alternarCodigo(e, l.code))}
                  className={`flex min-h-11 items-center gap-2 rounded-full border bg-card px-3 py-1 text-sm md:min-h-9 ${visivel ? '' : 'opacity-40'}`}
                >
                  <span aria-hidden style={{ color: l.color }}>
                    {SIMBOLO[l.shape]}
                  </span>
                  {l.label} <b>{l.n.toLocaleString('pt-BR')}</b>
                </button>
              );
            })}
          </div>
          <div className="relative">
            {mapa.isFetching && (
              <div role="status" className="absolute right-3 top-3 z-10 rounded bg-card px-2 py-1 text-xs shadow">
                carregando clientes…
              </div>
            )}
            <PinosMapa pins={visiveis} cores={cores} chaveEnquadre={`${pracaId}|${modo}`} onPino={setSelecionado} balao={balao} />
          </div>
          {selecionado && detalhe.data?.id === selecionado && (
            <div className={`${CARTAO} flex flex-wrap items-center justify-between gap-2 p-4 text-sm`}>
              <span className="min-w-0 break-words">{linhasDoBalao(detalhe.data).slice(0, 2).join(' · ')}</span>
              <Button variant="outline" onClick={() => abrirLead(detalhe.data!.id)}>
                Ver cliente
              </Button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {m.without_location.toLocaleString('pt-BR')} sem localização não aparecem no mapa.
            {m.truncado ? ` Mostrando ${m.pins.length.toLocaleString('pt-BR')} de ${m.total.toLocaleString('pt-BR')}: escolha uma praça para ver todos.` : ''}
          </p>
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer py-2 text-sm">ⓘ Como contamos</summary>
            <p>{m.conta}</p>
          </details>
        </>
      )}
    </div>
  );
}
