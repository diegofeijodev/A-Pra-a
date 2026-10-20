'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { AvisoGps } from '@/components/campo/AvisoGps';
import { CadastrosConfirmadosCard } from '@/components/campo/CadastrosConfirmadosCard';
import { CampoTopo } from '@/components/campo/CampoTopo';
import { FaixaFila } from '@/components/campo/FaixaFila';
import { GanhosCard } from '@/components/campo/GanhosCard';
import { MetaCard } from '@/components/campo/MetaCard';
import { PixCard } from '@/components/campo/PixCard';
import { RetornosCampo } from '@/components/campo/RetornosCampo';
import { RoteiroCard } from '@/components/campo/RoteiroCard';
import { ChegueiBotao } from '@/components/campo/simples/ChegueiBotao';
import { Button } from '@/components/ui/button';
import { useCampoSession } from '@/modules/campo/application/campo-session.store';
import { useDia } from '@/modules/campo/application/use-campo';
import { useFluxo } from '@/modules/campo/application/use-fluxo';
import { enfileirar, useFilaStore } from '@/modules/campo/application/use-fila';
import { useSol } from '@/modules/campo/application/use-sol';
import { irPara } from '@/modules/campo/application/use-tela';
import type { Posicao } from '@/modules/campo/domain/campo.types';
import { AVISO_ENVIOS_GUARDADOS } from '@/modules/campo/domain/fila-politica';
import { plural } from '@/modules/campo/domain/formatos';
import type { MotivoGps } from '@/modules/campo/domain/gps-mensagens';
import { ErroGps, lerPosicao } from '@/modules/campo/infrastructure/gps';
import { useRoteiro } from '@/modules/rotas/application/use-roteiro';
import { proximaParada } from '@/modules/rotas/domain/rota-local';

type Aba = 'hoje' | 'retornos' | 'ganhos';
const ABAS: [Aba, string][] = [['hoje', 'Hoje'], ['retornos', 'Retornos'], ['ganhos', 'Ganhos']];

/**
 * Visão `hoje` do fluxo SIMPLES (contrato §31, UX §2.2 S1). Roteiro + meta no alto; "Cheguei" fixo no rodapé, sempre
 * à vista, abrindo a câmera direto; Ganhos, Pix, cadastros confirmados e retornos saem para as abas (nada é apagado).
 */
export function SimplesHojeTela() {
  const consultantId = useCampoSession((s) => s.session?.consultant.id ?? '');
  const { config } = useFluxo();
  const { dia, carregando } = useDia(config.fechado_conta_na_meta);
  const temFila = useFilaStore((s) => s.itens.length > 0);
  const { sol, alternar } = useSol();
  const rot = useRoteiro();
  const [aba, setAba] = useState<Aba>('hoje');
  const [gps, setGps] = useState<MotivoGps | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function comPosicao(acao: (p: Posicao) => Promise<void>) {
    setGps(null);
    setOcupado(true);
    try {
      await acao(await lerPosicao());
    } catch (e) {
      if (e instanceof ErroGps) setGps(e.motivo);
      else toast.error('Não foi possível guardar a ação neste aparelho.');
    } finally {
      setOcupado(false);
    }
  }
  const iniciar = () => comPosicao((p) => enfileirar({ kind: 'start', payload: { client_id: crypto.randomUUID(), ...p } }, consultantId));
  const encerrar = () => {
    const feitas = dia.contadores.feitas;
    const meta = rot.route?.params.meta_diaria;
    const texto = `Encerrar o dia?\n\nVocê fez ${meta ? `${feitas} de ${meta}` : feitas} ${meta ? 'visitas' : plural(feitas, 'visita', 'visitas')}. A localização para de ser registrada.`;
    if (!window.confirm(temFila ? `${texto}\n\n${AVISO_ENVIOS_GUARDADOS}` : texto)) return;
    void comPosicao((p) => enfileirar({ kind: 'end', payload: p }, consultantId));
  };

  const aberta = dia.visitaAberta;
  const proxima = rot.habilitado && rot.route ? proximaParada(rot.route.stops) : null;
  const dataHoje = new Date().toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });

  return (
    <main data-sol={sol} className="space-y-4 pb-52">
      <CampoTopo titulo={`Hoje · ${dataHoje}`} />
      <div className="flex justify-end">
        <button
          type="button"
          role="switch"
          aria-checked={sol}
          onClick={alternar}
          className="simples-chip flex h-12 min-h-12 items-center gap-2 px-3 text-sm"
        >
          <span aria-hidden>☀</span> Sol
        </button>
      </div>
      <FaixaFila />
      {gps && <AvisoGps motivo={gps} onFechar={() => setGps(null)} />}

      {aba === 'hoje' && (
        <>
          {carregando ? (
            <div aria-busy="true" className="space-y-3">
              <div className="h-24 animate-pulse rounded-lg bg-muted" />
              <div className="h-40 animate-pulse rounded-lg bg-muted" />
            </div>
          ) : !dia.jornada ? (
            <section className="card-surface space-y-2 p-5">
              <p className="text-base font-bold">Pronto para sair?</p>
              <p className="text-sm text-muted-foreground">
                A localização só é registrada com o dia aberto: no início, a cada 5 minutos com esta tela aberta, em cada chegada e conclusão e no
                fim. Antes de iniciar e depois de encerrar, nada é registrado.
              </p>
            </section>
          ) : (
            <>
              {!rot.carregando && !(rot.habilitado && rot.route) && <MetaCard fechadoContaNaMeta={config.fechado_conta_na_meta} />}
              {rot.habilitado && <RoteiroCard fechadoContaNaMeta={config.fechado_conta_na_meta} />}
              <p className="text-sm text-muted-foreground">
                {dia.contadores.cadastrou_agora > 0
                  ? `${plural(dia.contadores.cadastrou_agora, 'cadastro declarado', 'cadastros declarados')} hoje. `
                  : ''}
                {dia.contadores.fechadas > 0 && !config.fechado_conta_na_meta
                  ? `${plural(dia.contadores.fechadas, 'estabelecimento fechado', 'estabelecimentos fechados')} (fora da meta).`
                  : ''}
              </p>
              {!aberta && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => irPara({ v: 'nova' })}
                    className="flex h-12 flex-1 items-center justify-center rounded-md border border-border text-sm font-bold"
                  >
                    Visita fora do roteiro
                  </button>
                  <Button variant="outline" onClick={encerrar} disabled={ocupado} className="h-12 flex-1 text-sm">
                    Encerrar o dia
                  </Button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {aba === 'retornos' && <RetornosCampo />}
      {aba === 'ganhos' && (
        <div className="space-y-4">
          <CadastrosConfirmadosCard />
          <GanhosCard />
          <PixCard />
        </div>
      )}

      <div className="fixed inset-x-0 bottom-0 border-t border-border bg-background/95 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur">
        <div className="mx-auto max-w-md space-y-2 px-4 pt-3">
          <div className="flex gap-3">
            <button type="button" onClick={() => irPara({ v: 'qr' })} className="flex h-14 w-24 shrink-0 items-center justify-center rounded-md border border-border text-sm font-bold">
              QR code
            </button>
            {carregando ? null : !dia.jornada ? (
              <Button onClick={() => void iniciar()} disabled={ocupado} className="h-14 flex-1 text-base">
                {ocupado ? 'Pegando a localização…' : 'Iniciar o dia'}
              </Button>
            ) : aberta ? (
              <button
                type="button"
                onClick={() => irPara({ v: 'visita', ref: aberta.ref })}
                className="flex h-14 flex-1 items-center justify-center rounded-md bg-primary px-3 text-center text-base font-bold text-primary-foreground"
              >
                Continuar visita: {aberta.nome}
              </button>
            ) : proxima ? (
              <ChegueiBotao alvo={{ nome: proxima.name, lead_id: proxima.lead_id }} className="flex-1">
                Cheguei: tirar a foto
              </ChegueiBotao>
            ) : (
              <button
                type="button"
                onClick={() => irPara({ v: 'nova' })}
                className="flex h-14 flex-1 items-center justify-center rounded-md bg-primary text-base font-bold text-primary-foreground"
              >
                Visita no caminho
              </button>
            )}
          </div>
          <nav role="tablist" aria-label="Seções" className="grid grid-cols-3 gap-1">
            {ABAS.map(([id, rotulo]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={aba === id}
                onClick={() => setAba(id)}
                className={`h-14 rounded-md text-sm font-bold ${aba === id ? 'bg-primary/15 text-foreground underline decoration-2 underline-offset-4' : 'text-muted-foreground'}`}
              >
                {rotulo}
              </button>
            ))}
          </nav>
        </div>
      </div>
    </main>
  );
}
