'use client';

import { Suspense } from 'react';
import { CadastroEmpresaTela } from '@/components/campo/CadastroEmpresaTela';
import { HojeTela } from '@/components/campo/HojeTela';
import { NovaVisitaTela } from '@/components/campo/NovaVisitaTela';
import { PedirCupomTela } from '@/components/campo/PedirCupomTela';
import { ParadaTela } from '@/components/campo/ParadaTela';
import { QrTela } from '@/components/campo/QrTela';
import { ResumoDiaTela } from '@/components/campo/ResumoDiaTela';
import { RoteiroTela } from '@/components/campo/RoteiroTela';
import { VisitaTela } from '@/components/campo/VisitaTela';
import { OndeVoceEstaTela } from '@/components/campo/simples/OndeVoceEstaTela';
import { ResultadoTela } from '@/components/campo/simples/ResultadoTela';
import { SimplesHojeTela } from '@/components/campo/simples/SimplesHojeTela';
import { SimplesListaTela } from '@/components/campo/simples/SimplesListaTela';
import { useDia } from '@/modules/campo/application/use-campo';
import { useFluxo } from '@/modules/campo/application/use-fluxo';
import { useTela } from '@/modules/campo/application/use-tela';

/**
 * Roteador de visões de `/campo` (`?v=nova|visita&ref=|cadastro&ref=|qr|roteiro|parada&id=`). Nenhuma troca de
 * tela é navegação do Next: sem sinal, a rota não buscaria nada no servidor.
 */
function Visao() {
  const tela = useTela();
  const { fluxo } = useFluxo();
  const { dia } = useDia();
  // Modo do chefe (contrato §31): as telas simples só existem com a flag ligada e o fluxo resolvido `simples`;
  // sem isso (padrão) tudo abaixo é o que sempre foi. Cada VISITA abre pela tela do fluxo em que nasceu.
  const simples = fluxo === 'simples';
  switch (tela.v) {
    case 'nova':
      return simples ? <OndeVoceEstaTela /> : <NovaVisitaTela />;
    case 'visita': {
      const flowDaVisita = dia.visitas.find((v) => v.ref === tela.ref)?.flow ?? fluxo;
      return flowDaVisita === 'simples' ? <ResultadoTela key={tela.ref} refVisita={tela.ref} /> : <VisitaTela key={tela.ref} refVisita={tela.ref} />;
    }
    case 'qr':
      return <QrTela />;
    case 'cadastro':
      return <CadastroEmpresaTela key={tela.ref} refVisita={tela.ref} />;
    case 'roteiro':
      return simples ? <SimplesListaTela /> : <RoteiroTela />;
    case 'parada':
      return <ParadaTela key={tela.id} id={tela.id} />;
    case 'resumo':
      return <ResumoDiaTela key={tela.dia ?? 'hoje'} dia={tela.dia} />;
    case 'pedir-cupom':
      return <PedirCupomTela key={tela.ref} refVisita={tela.ref} />;
    default:
      return simples ? <SimplesHojeTela /> : <HojeTela />;
  }
}

export default function CampoPage() {
  return (
    <Suspense fallback={null}>
      <Visao />
    </Suspense>
  );
}
