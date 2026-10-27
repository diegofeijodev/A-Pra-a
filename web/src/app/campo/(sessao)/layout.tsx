'use client';

import { useRouter } from 'next/navigation';
import { Suspense, useEffect, useRef } from 'react';
import { AbasRepresentante } from '@/components/campo/AbasRepresentante';
import { FaixaFila } from '@/components/campo/FaixaFila';
import { FaixaRepresentante } from '@/components/campo/FaixaRepresentante';
import { useCampoSession } from '@/modules/campo/application/campo-session.store';
import { useCampoMe, useDia } from '@/modules/campo/application/use-campo';
import { useFilaRunner } from '@/modules/campo/application/use-fila';
import { useRastreio } from '@/modules/campo/application/use-rastreio';
import { useSol } from '@/modules/campo/application/use-sol';

/** Fila, `/me` e trilha rodam enquanto qualquer tela do consultor estiver aberta. */
function CampoMotor({ consultantId }: { consultantId: string }) {
  useFilaRunner(consultantId);
  useCampoMe();
  const { dia } = useDia();
  // Lote B §37: a localização pausa durante o intervalo (privacidade no almoço, UX §3.6).
  useRastreio(!!dia.jornada && !dia.intervaloAberto, consultantId);
  return null;
}

/**
 * O topo fixo (faixa azul + fila de envios) muda de altura com a fila: a altura vai para `--campo-topo`, e o cartão fixo do
 * Roteiro (UX §4.13) gruda logo abaixo dele, em vez de ficar por baixo da faixa.
 */
function useAlturaDoTopo() {
  const raiz = useRef<HTMLDivElement>(null);
  const topo = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = topo.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const medir = () => raiz.current?.style.setProperty('--campo-topo', `${Math.round(el.getBoundingClientRect().height)}px`);
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  });
  return { raiz, topo };
}

/**
 * Guarda das telas do consultor (mesma regra do `(app)/layout.tsx` da equipe:
 * a página nem monta sem sessão). Senha provisória pendente → `/campo/senha`.
 *
 * Casca do representante (redesenho E4, arquitetura §3.6, UX §2.5): faixa azul no topo ("Praça" + "Sair") e as 5 abas embaixo
 * (Hoje, Mapa, Clientes, Desempenho, Carteira), todas visões da rota única `/campo` — a fila, o `/me` e a trilha (`CampoMotor`)
 * continuam por baixo, iguais. O espaço de baixo é o da barra das abas; cada tela soma o do próprio botão fixo.
 * Redesenho E5c (UX §2.5): a `FaixaFila` sobe para o topo fixo, logo abaixo da faixa azul, em TODAS as visões; o modo Sol vale
 * para a casca inteira (`data-sol` aqui, o interruptor na faixa).
 */
export default function CampoSessaoLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const session = useCampoSession((s) => s.session);
  const hydrated = useCampoSession((s) => s.hydrated);
  const hydrate = useCampoSession((s) => s.hydrate);
  const pendente = session?.consultant.must_change_password ?? false;
  const { sol } = useSol();
  const { raiz, topo } = useAlturaDoTopo();

  useEffect(() => {
    if (!hydrated) hydrate();
  }, [hydrated, hydrate]);

  useEffect(() => {
    if (!hydrated) return;
    if (!session) router.replace('/campo/entrar');
    else if (pendente) router.replace('/campo/senha');
  }, [hydrated, session, pendente, router]);

  if (!hydrated || !session || pendente) {
    return <div className="grid min-h-dvh place-items-center text-sm text-muted-foreground">Carregando…</div>;
  }

  return (
    <div ref={raiz} data-sol={sol} className="min-h-dvh pb-[calc(4.5rem+env(safe-area-inset-bottom))] [--campo-topo:3.25rem]">
      <CampoMotor consultantId={session.consultant.id} />
      <div ref={topo} className="sticky top-0 z-20">
        <FaixaRepresentante />
        {/* Fila sem sinal (nossa, UX §2.5 [desvio: campo]): à vista em toda visão; muitos avisos rolam dentro da faixa. */}
        <div className="max-h-[40dvh] overflow-y-auto bg-background px-4 empty:hidden [&>*]:mx-auto [&>*]:max-w-2xl [&>*]:py-2">
          <FaixaFila />
        </div>
      </div>
      <div className="mx-auto max-w-2xl px-4 pt-4">{children}</div>
      {/* `useSearchParams` (a visão ativa) pede o seu próprio limite de Suspense. */}
      <Suspense fallback={null}>
        <AbasRepresentante />
      </Suspense>
    </div>
  );
}
