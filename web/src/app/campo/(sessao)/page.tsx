'use client';

import { Suspense } from 'react';
import { HojeTela } from '@/components/campo/HojeTela';
import { NovaVisitaTela } from '@/components/campo/NovaVisitaTela';
import { ParadaTela } from '@/components/campo/ParadaTela';
import { QrTela } from '@/components/campo/QrTela';
import { RoteiroTela } from '@/components/campo/RoteiroTela';
import { VisitaTela } from '@/components/campo/VisitaTela';
import { useTela } from '@/modules/campo/application/use-tela';

/**
 * Roteador de visões de `/campo` (`?v=nova|visita&ref=|qr|roteiro|parada&id=`). Nenhuma troca de
 * tela é navegação do Next: sem sinal, a rota não buscaria nada no servidor.
 */
function Visao() {
  const tela = useTela();
  switch (tela.v) {
    case 'nova':
      return <NovaVisitaTela />;
    case 'visita':
      return <VisitaTela key={tela.ref} refVisita={tela.ref} />;
    case 'qr':
      return <QrTela />;
    case 'roteiro':
      return <RoteiroTela />;
    case 'parada':
      return <ParadaTela key={tela.id} id={tela.id} />;
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
