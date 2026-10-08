'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useCampoSession } from '@/modules/campo/application/campo-session.store';

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

  return <div className="mx-auto min-h-dvh max-w-md px-4 pb-36 pt-4">{children}</div>;
}
