'use client';

import { Suspense } from 'react';
import { HojeTela } from '@/components/campo/HojeTela';
import { NovaVisitaTela } from '@/components/campo/NovaVisitaTela';
import { QrTela } from '@/components/campo/QrTela';
import { RotaTela } from '@/components/campo/RotaTela';
import { VisitaTela } from '@/components/campo/VisitaTela';
import { useTela } from '@/modules/campo/application/use-tela';

/**
 * Roteador de visões de `/campo` (`?v=nova|visita&ref=|qr|rota|numeros`). Nenhuma troca de
 * tela é navegação do Next: sem sinal, a rota não buscaria nada no servidor.
 */
function Visao() {
  const tela = useTela();
  switch (tela.v) {
    case 'nova':
      return <NovaVisitaTela key={tela.lead ?? ''} doRoteiro={tela.lead && tela.nome ? { lead_id: tela.lead, nome: tela.nome } : null} />;
    case 'visita':
      return <VisitaTela key={tela.ref} refVisita={tela.ref} />;
    case 'qr':
      return <QrTela />;
    case 'rota':
      return <RotaTela />;
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
