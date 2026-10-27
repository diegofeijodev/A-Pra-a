import type { Metadata } from 'next';
import { Suspense } from 'react';
import { EntradaUnica } from '@/components/entrada/EntradaUnica';

export const metadata: Metadata = {
  title: 'Entrar — Praça',
  description: 'Acesse o Praça com o seu e-mail e a sua senha.',
};

/** Entrada única da equipe e do representante (redesenho E3, arquitetura §3.2). O `useSearchParams` do `?demo=1` pede o Suspense. */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <EntradaUnica />
    </Suspense>
  );
}
