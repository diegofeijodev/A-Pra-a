import type { Metadata } from 'next';
import { Suspense } from 'react';
import { EntradaUnica } from '@/components/entrada/EntradaUnica';

export const metadata: Metadata = {
  title: 'Entrar — Praça',
  description: 'Acesse o Praça com o seu e-mail e a sua senha.',
};

/**
 * A MESMA entrada única do `/entrar`, neste endereço para o atalho instalado do consultor não sair do `scope: '/campo'` (arquitetura
 * §3.4): é para cá que o 401 do `campo-http.ts` manda, e o link do WhatsApp com a senha provisória aponta para cá.
 */
export default function EntrarCampoPage() {
  return (
    <Suspense fallback={null}>
      <EntradaUnica />
    </Suspense>
  );
}
