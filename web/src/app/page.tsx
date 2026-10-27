'use client';

import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { ROTA } from '@/modules/acesso/domain/enderecos';
import { useAuth } from '@/modules/auth/application/use-auth';
import { useCampoSession } from '@/modules/campo/application/campo-session.store';
import { destinoDaSessao } from '@/modules/entrada/domain/entrada';

/**
 * A raiz não tem tela própria (arquitetura §3.3): equipe → o Dashboard (sempre; sem o painel ligado ele mostra a Atenção agora);
 * só o consultor → a casca dele (ou a troca da senha provisória); ninguém → a entrada.
 */
export default function Home() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const sessaoCampo = useCampoSession((s) => s.session);
  const campoPronto = useCampoSession((s) => s.hydrated);
  const hidratarCampo = useCampoSession((s) => s.hydrate);

  useEffect(() => {
    if (!campoPronto) hidratarCampo();
  }, [campoPronto, hidratarCampo]);

  useEffect(() => {
    if (loading || !campoPronto) return;
    const destino = destinoDaSessao({
      equipe: !!user,
      campo: sessaoCampo ? { must_change_password: sessaoCampo.consultant.must_change_password } : null,
    });
    router.replace(destino ?? ROTA.entrar);
  }, [loading, campoPronto, user, sessaoCampo, router]);

  return (
    <div className="flex min-h-screen items-center justify-center" role="status" aria-label="Carregando">
      <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden />
    </div>
  );
}
