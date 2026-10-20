'use client';

import { CampoTopo } from '@/components/campo/CampoTopo';
import { FaixaFila } from '@/components/campo/FaixaFila';
import { ChegueiBotao } from '@/components/campo/simples/ChegueiBotao';
import { useDia } from '@/modules/campo/application/use-campo';
import { useSol } from '@/modules/campo/application/use-sol';
import { irPara } from '@/modules/campo/application/use-tela';
import { useRoteiro } from '@/modules/rotas/application/use-roteiro';
import { etaTexto, faltam } from '@/modules/rotas/domain/rota-local';

/**
 * "Ver as N que faltam" do fluxo simples (UX §2.2): cada linha pendente tem o próprio "Cheguei aqui", que abre a
 * câmera — 2 toques até a foto em vez de 5 telas. Tocar no nome abre os detalhes (Maps, Ligar, Pular).
 */
export function SimplesListaTela() {
  const rot = useRoteiro();
  const { dia } = useDia();
  const { sol } = useSol();
  const pendentes = rot.route ? faltam(rot.route.stops) : [];

  return (
    <main data-sol={sol} className="space-y-4 pb-24">
      <CampoTopo titulo="Paradas que faltam" />
      <FaixaFila />
      {rot.carregando ? (
        <div aria-busy="true" className="space-y-2">
          <div className="h-20 animate-pulse rounded-lg bg-muted" />
          <div className="h-20 animate-pulse rounded-lg bg-muted" />
        </div>
      ) : !rot.route ? (
        <p className="card-surface p-5 text-sm">Sem roteiro para hoje. Você pode visitar quem estiver no caminho.</p>
      ) : pendentes.length === 0 ? (
        <p className="card-surface p-5 text-sm">Nenhuma parada pendente. Roteiro concluído.</p>
      ) : (
        <ul className="space-y-2">
          {pendentes.map((s) => (
            <li key={s.id} className="card-surface space-y-2 p-3">
              <button type="button" onClick={() => irPara({ v: 'parada', id: s.id })} className="block min-h-12 w-full text-left">
                <span className="block text-base font-bold">{s.name}</span>
                <span className="block text-sm text-muted-foreground">
                  {[s.address || 'Sem endereço', s.status === 'adiada' ? 'deixada para a tarde' : `chega por volta das ${etaTexto(s.eta)}`].join(' · ')}
                </span>
              </button>
              {!dia.visitaAberta && (
                <ChegueiBotao alvo={{ nome: s.name, lead_id: s.lead_id }} pequeno>
                  Cheguei aqui
                </ChegueiBotao>
              )}
            </li>
          ))}
        </ul>
      )}
      <button type="button" onClick={() => irPara({ v: 'hoje' })} className="flex h-12 w-full items-center justify-center rounded-md border border-border text-sm font-bold">
        Voltar
      </button>
    </main>
  );
}
