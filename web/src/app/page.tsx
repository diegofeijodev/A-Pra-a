'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { paginaInicial } from '@/modules/acesso/domain/acesso';
import { getFeaturesMenu } from '@/modules/acesso/infrastructure/acesso.api';
import { useAuth } from '@/modules/auth/application/use-auth';

/**
 * A raiz não tem tela própria. Sem sessão: a entrada. Com sessão: a página inicial da equipe — "Início" (o painel) só com
 * FIELD_DASHBOARD_ENABLED (UX §3.1); desligado, ou se a leitura falhar, o Hoje, como sempre.
 */
export default function Home() {
  const router = useRouter();
  const { user, loading } = useAuth();
  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/hoje');
      return;
    }
    let vivo = true;
    void getFeaturesMenu()
      .then((f) => paginaInicial(f))
      .catch(() => '/hoje')
      .then((d) => vivo && router.replace(d));
    return () => {
      vivo = false;
    };
  }, [loading, user, router]);
  return <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">Carregando…</div>;
}
