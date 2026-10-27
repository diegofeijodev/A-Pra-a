'use client';

import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { ActionPanel } from '@/components/praca/ActionPanel';
import { AppShell } from '@/components/praca/AppShell';
import { LeadPanel } from '@/components/praca/LeadPanel';
import { useAuth } from '@/modules/auth/application/use-auth';
import { useMe } from '@/modules/auth/application/use-me';

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
    // UX §2.4 (Lovable): o giro azul no meio da tela enquanto lê a sessão (leitura local, < 1 s).
    return (
      <div className="flex min-h-screen items-center justify-center" role="status" aria-label="Carregando">
        <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden />
      </div>
    );
  }

  return (
    <>
      <AppShell>{children}</AppShell>
      {/* Painéis globais: abrem por `openActionId` / `openLeadId` do
          `lib/ui-store.ts`, de qualquer tela. Ficam FORA do `AppShell` porque
          são sobreposição de tela cheia. */}
      <ActionPanel />
      <LeadPanel />
    </>
  );
}
