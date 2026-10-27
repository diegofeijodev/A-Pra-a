'use client';

import { useQueryClient } from '@tanstack/react-query';
import { LogOut, MapPin } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCampoSession } from '@/modules/campo/application/campo-session.store';
import { ROTA_CAMPO } from '@/modules/acesso/domain/enderecos';

/**
 * Faixa azul do topo da casca do representante (Lovable `route.tsx`, UX §2.5): "Praça" e "Sair". Sair limpa o cache da conta e
 * a sessão; a fila offline continua no aparelho (o que o `CampoTopo` fazia antes da casca nova).
 */
export function FaixaRepresentante() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const signOut = useCampoSession((s) => s.signOut);

  async function sair() {
    // Limpa o cache ANTES de trocar de conta (mesma regra do `useAuth` da equipe).
    await queryClient.cancelQueries();
    queryClient.clear();
    signOut();
    router.replace(ROTA_CAMPO.entrar);
  }

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between bg-brand px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] text-primary-foreground">
      <div className="flex items-center gap-2 font-semibold">
        <MapPin className="h-5 w-5" aria-hidden /> Praça
      </div>
      <button
        type="button"
        onClick={() => void sair()}
        aria-label="Sair"
        className="grid h-11 w-11 place-items-center rounded-md opacity-80 hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-foreground"
      >
        <LogOut className="h-5 w-5" aria-hidden />
      </button>
    </header>
  );
}
