'use client';

import { useQueryClient } from '@tanstack/react-query';
import { LogOut, MapPin, Sun } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Suspense } from 'react';
import { useCampoSession } from '@/modules/campo/application/campo-session.store';
import { useSol } from '@/modules/campo/application/use-sol';
import { useTela } from '@/modules/campo/application/use-tela';
import { ROTA_CAMPO } from '@/modules/acesso/domain/enderecos';

/** Interruptor do modo Sol (nosso, UX §2.5 [desvio: campo]): só nas visões Hoje e Roteiro, onde se lê a lista ao ar livre. */
function InterruptorSol() {
  const tela = useTela();
  const { sol, alternar } = useSol();
  if (tela.v !== 'hoje' && tela.v !== 'roteiro') return null;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={sol}
      aria-label="Contraste para sol forte"
      onClick={alternar}
      className={`grid h-11 w-11 place-items-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-foreground ${
        sol ? 'bg-primary-foreground/25 opacity-100' : 'opacity-80 hover:opacity-100'
      }`}
    >
      <Sun className="h-5 w-5" aria-hidden />
    </button>
  );
}

/**
 * Faixa azul do topo da casca do representante (Lovable `route.tsx`, UX §2.5): "Praça", o interruptor Sol (nosso) e "Sair".
 * Sair limpa o cache da conta e a sessão; a fila offline continua no aparelho (o que o `CampoTopo` fazia antes da casca nova).
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
    <header className="flex items-center justify-between bg-brand px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] text-primary-foreground">
      <div className="flex items-center gap-2 font-semibold">
        <MapPin className="h-5 w-5" aria-hidden /> Praça
      </div>
      <div className="flex items-center gap-1">
        {/* `useTela` lê a URL: limite de `Suspense` próprio, para a faixa nunca esperar por ele. */}
        <Suspense fallback={null}>
          <InterruptorSol />
        </Suspense>
        <button
          type="button"
          onClick={() => void sair()}
          aria-label="Sair"
          className="grid h-11 w-11 place-items-center rounded-md opacity-80 hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-foreground"
        >
          <LogOut className="h-5 w-5" aria-hidden />
        </button>
      </div>
    </header>
  );
}
