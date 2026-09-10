'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { AppShell } from '@/components/praca/AppShell';
import { useAuth } from '@/modules/auth/application/use-auth';
import { useMe } from '@/modules/auth/application/use-me';
import { ThemeSync } from './ThemeSync';

/**
 * Guarda de sessão das telas internas.
 *
 * O portão fica no LAYOUT, não dentro do AppShell: assim a página nem chega a
 * montar sem sessão. Quando a guarda vivia só no shell, cada tela já tinha
 * disparado seu `useQuery` autenticado e o console enchia de 401 no meio do
 * redirecionamento (ver CLAUDE.md).
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, loading } = useAuth();

  // Ponto único de montagem de `['auth','me']`: o que voltar daqui é escrito de
  // volta na sessão, então invalidar essa chave (ou criar uma praça, que muda
  // `active_praca_id` no servidor) atualiza o shell inteiro.
  useMe();

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/entrar');
  }, [loading, user, router]);

  if (loading || !user) {
    return <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">Carregando…</div>;
  }

  return (
    <>
      <ThemeSync />
      <AppShell>{children}</AppShell>
      {/* <ActionPanel /> global entra na Task 19 e <LeadPanel /> na Task 20 —
          os dois abrem por `openActionId` / `openLeadId` do `lib/ui-store.ts`. */}
    </>
  );
}
