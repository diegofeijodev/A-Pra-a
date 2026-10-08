'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useCampoSession } from '@/modules/campo/application/campo-session.store';

/** Cabeçalho das telas do consultor: título, quem está logado e "Sair". */
export function CampoTopo({ titulo }: { titulo: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const session = useCampoSession((s) => s.session);
  const signOut = useCampoSession((s) => s.signOut);

  async function sair() {
    // Limpa o cache ANTES de trocar de conta (mesma regra do `useAuth` da equipe).
    await queryClient.cancelQueries();
    queryClient.clear();
    signOut();
    router.replace('/campo/entrar');
  }

  return (
    <header className="flex items-start justify-between gap-3">
      <div>
        <p className="font-display text-2xl font-black tracking-tight">{titulo}</p>
        <p className="text-xs text-muted-foreground">
          {session?.consultant.name} · {session?.consultant.praca_name}
        </p>
      </div>
      <button
        onClick={() => void sair()}
        className="rounded-md border border-border px-3 py-2 text-xs text-muted-foreground"
      >
        Sair
      </button>
    </header>
  );
}
