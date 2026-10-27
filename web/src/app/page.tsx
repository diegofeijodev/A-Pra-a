'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { paginaInicial } from '@/modules/acesso/domain/acesso';
import { ROTA } from '@/modules/acesso/domain/enderecos';
import { useAuth } from '@/modules/auth/application/use-auth';

/**
 * A raiz não tem tela própria. Sem sessão: a entrada. Com sessão: a página inicial da equipe, que é sempre o Dashboard
 * (arquitetura §2.3; sem o painel ligado, ele mostra a Atenção agora). Nada de `/hoje`: é do Comercial.
 */
export default function Home() {
  const router = useRouter();
  const { user, loading } = useAuth();
  useEffect(() => {
    if (loading) return;
    router.replace(user ? paginaInicial() : ROTA.entrar);
  }, [loading, user, router]);
  return <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">Carregando…</div>;
}
