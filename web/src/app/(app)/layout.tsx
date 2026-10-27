'use client';

import { Loader2 } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { ActionPanel } from '@/components/praca/ActionPanel';
import { AppShell } from '@/components/praca/AppShell';
import { LeadPanel } from '@/components/praca/LeadPanel';
import { destinoDoRepresentantePorEndereco, ROTA } from '@/modules/acesso/domain/enderecos';
import { useAuth } from '@/modules/auth/application/use-auth';
import { useMe } from '@/modules/auth/application/use-me';
import { useCampoSession } from '@/modules/campo/application/campo-session.store';

/**
 * Guarda de sessão das telas internas.
 *
 * O portão fica no LAYOUT, não dentro do AppShell: assim a página nem chega a
 * montar sem sessão. Quando a guarda vivia só no shell, cada tela já tinha
 * disparado seu `useQuery` autenticado e o console enchia de 401 no meio do
 * redirecionamento (ver CLAUDE.md).
 *
 * Entrada única (redesenho E3, arquitetura §3.3): sem sessão da equipe mas COM a do consultor, o endereço leva à casca dele (o mesmo
 * link serve às duas pessoas, como na Lovable), nunca à entrada. Daqui só se LÊ se a sessão do consultor existe: nada de `CampoMotor`
 * (fila, `/me`, rastreio) nem `campoApi` na árvore da equipe.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading } = useAuth();
  const temSessaoCampo = useCampoSession((s) => s.session !== null);
  const campoPronto = useCampoSession((s) => s.hydrated);
  const hidratarCampo = useCampoSession((s) => s.hydrate);

  // Ponto único de montagem de `['auth','me']`: o que voltar daqui é escrito de
  // volta na sessão, então invalidar essa chave (ou criar uma praça, que muda
  // `active_praca_id` no servidor) atualiza o shell inteiro.
  useMe();

  useEffect(() => {
    if (!campoPronto) hidratarCampo();
  }, [campoPronto, hidratarCampo]);

  useEffect(() => {
    if (loading || user || !campoPronto) return;
    router.replace(temSessaoCampo ? destinoDoRepresentantePorEndereco(pathname) : ROTA.entrar);
  }, [loading, user, campoPronto, temSessaoCampo, pathname, router]);

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
