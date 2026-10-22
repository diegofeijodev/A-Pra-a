'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useCampoSession } from '@/modules/campo/application/campo-session.store';
import { useCampoMe, useDia } from '@/modules/campo/application/use-campo';
import { useFilaRunner } from '@/modules/campo/application/use-fila';
import { useRastreio } from '@/modules/campo/application/use-rastreio';

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
 * Guarda das telas do consultor (mesma regra do `(app)/layout.tsx` da equipe:
 * a página nem monta sem sessão). Senha provisória pendente → `/campo/senha`.
 */
export default function CampoSessaoLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const session = useCampoSession((s) => s.session);
  const hydrated = useCampoSession((s) => s.hydrated);
  const hydrate = useCampoSession((s) => s.hydrate);
  const pendente = session?.consultant.must_change_password ?? false;

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
    <div className="mx-auto min-h-dvh max-w-md px-4 pb-36 pt-[max(1rem,env(safe-area-inset-top))]">
      <CampoMotor consultantId={session.consultant.id} />
      {children}
    </div>
  );
}
