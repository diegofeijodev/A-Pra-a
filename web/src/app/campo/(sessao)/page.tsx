'use client';

import { Suspense } from 'react';
import { HojeTela } from '@/components/campo/HojeTela';
import { NovaVisitaTela } from '@/components/campo/NovaVisitaTela';
import { QrTela } from '@/components/campo/QrTela';
import { VisitaTela } from '@/components/campo/VisitaTela';
import { useTela } from '@/modules/campo/application/use-tela';

/**
 * Roteador de visões de `/campo` (`?v=nova|visita&ref=|qr`). Nenhuma troca de
 * tela é navegação do Next: sem sinal, a rota não buscaria nada no servidor.
 */
function Visao() {
  const tela = useTela();
  switch (tela.v) {
    case 'nova':
      return <NovaVisitaTela />;
    case 'visita':
      return <VisitaTela refVisita={tela.ref} />;
    case 'qr':
      return <QrTela />;
    default:
      return <HojeTela />;
  }
}

export default function CampoPage() {
  return (
    <Suspense fallback={null}>
      <Visao />
    </Suspense>
  );
}
