'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { AvisoGps } from '@/components/campo/AvisoGps';
import { CampoTopo } from '@/components/campo/CampoTopo';
import { FaixaFila } from '@/components/campo/FaixaFila';
import { CadastrosConfirmadosCard } from '@/components/campo/CadastrosConfirmadosCard';
import { GanhosCard } from '@/components/campo/GanhosCard';
import { IntervaloFaixa } from '@/components/campo/IntervaloCampo';
import { useIntervalo } from '@/modules/campo/application/use-intervalo';
import { PixCard } from '@/components/campo/PixCard';
import { MetaCard } from '@/components/campo/MetaCard';
import { RetornosCampo } from '@/components/campo/RetornosCampo';
import { CuponsCampo } from '@/components/campo/CuponsCampo';
import { ResumoDiaAtalhos } from '@/components/campo/ResumoDiaTela';
import { RoteiroCard } from '@/components/campo/RoteiroCard';
import { Button } from '@/components/ui/button';
import { useCampoSession } from '@/modules/campo/application/campo-session.store';
import { useCampoMe, useDia } from '@/modules/campo/application/use-campo';
import { enfileirar, useFilaStore } from '@/modules/campo/application/use-fila';
import { AVISO_ENVIOS_GUARDADOS } from '@/modules/campo/domain/fila-politica';
import type { Posicao } from '@/modules/campo/domain/campo.types';
import { duracaoMin, hora } from '@/modules/campo/domain/formatos';
import type { MotivoGps } from '@/modules/campo/domain/gps-mensagens';
import { ErroGps, lerPosicao } from '@/modules/campo/infrastructure/gps';
import { irPara } from '@/modules/campo/application/use-tela';
import { useRoteiro } from '@/modules/rotas/application/use-roteiro';
import { proximaParada } from '@/modules/rotas/domain/rota-local';

/** Visão `hoje` de `/campo`:  do consultor (spec §8.1): iniciar/encerrar, visitas do dia, contadores, QR a um toque. */
export function HojeTela() {
  const consultantId = useCampoSession((s) => s.session?.consultant.id ?? '');
  const { dia, carregando } = useDia();
  const temFila = useFilaStore((s) => s.itens.length > 0);
  const [gps, setGps] = useState<MotivoGps | null>(null);
  const me = useCampoMe();
  const resumoLigado = me.data?.features?.day_summary === true;
  const [ocupado, setOcupado] = useState(false);
  const intervalo = useIntervalo();

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

  const iniciar = () =>
    comPosicao((p) => enfileirar({ kind: 'start', payload: { client_id: crypto.randomUUID(), ...p } }, consultantId));

  const encerrar = () => {
    const texto = 'Encerrar a jornada de hoje? A localização para de ser registrada.';
    if (!window.confirm(temFila ? `${texto}\n\n${AVISO_ENVIOS_GUARDADOS}` : texto)) return;
    void comPosicao(async (p) => {
      await enfileirar({ kind: 'end', payload: p }, consultantId);
      // Resultado do dia (contrato §33.5): só com o módulo ligado.
      if (resumoLigado) irPara({ v: 'resumo' });
    });
  };

  const aberta = dia.visitaAberta;
  const emIntervalo = intervalo.ligado ? dia.intervaloAberto : null;
  const rot = useRoteiro();
  const proxima = rot.habilitado && rot.route ? proximaParada(rot.route.stops) : null;

  return (
    <main className="space-y-5">
      <CampoTopo titulo="Hoje" />
      <FaixaFila />
      {gps && <AvisoGps motivo={gps} onFechar={() => setGps(null)} />}

      {!carregando && !rot.carregando && !(rot.habilitado && rot.route) && <MetaCard />}
      {!carregando && <CadastrosConfirmadosCard />}
      {!carregando && <GanhosCard />}
      {!carregando && <PixCard />}
      {!carregando && <ResumoDiaAtalhos />}

      {carregando ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : !dia.jornada ? (
        <section className="card-surface space-y-2 p-5">
          <p className="text-base font-bold">Pronto para sair?</p>
          <p className="text-sm text-muted-foreground">
            A localização só é registrada com a jornada aberta: no início, a cada 5 minutos com esta tela
            aberta, em cada check-in e checkout e no fim. Antes de iniciar e depois de encerrar, nada é
            registrado.
          </p>
        </section>
      ) : (
        <>
          {emIntervalo && <IntervaloFaixa aberto={emIntervalo} lembreteMin={intervalo.lembreteMin} />}
          {rot.habilitado && <RoteiroCard />}

          <section className="grid grid-cols-2 gap-3">
            <div className="card-surface p-4">
              <p className="text-3xl font-black">{dia.contadores.feitas}</p>
              <p className="text-xs text-muted-foreground">{dia.contadores.feitas === 1 ? 'visita hoje' : 'visitas hoje'}</p>
              {dia.contadores.fechadas > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  + {dia.contadores.fechadas} {dia.contadores.fechadas === 1 ? 'fechado' : 'fechados'} (fora da meta)
                </p>
              )}
            </div>
            <div className="card-surface p-4">
              <p className="text-3xl font-black">{dia.contadores.cadastrou_qr}</p>
              <p className="text-xs text-muted-foreground">cadastrou agora</p>
            </div>
          </section>

          {emIntervalo ? (
            <Button onClick={() => void intervalo.voltar(emIntervalo)} className="h-14 text-base">
              Voltar do intervalo
            </Button>
          ) : aberta ? (
            <button
              type="button"
              onClick={() => irPara({ v: 'visita', ref: aberta.ref })}
              className="flex h-14 items-center justify-center rounded-md bg-primary px-4 text-center text-base font-bold text-primary-foreground"
            >
              Continuar visita: {aberta.nome}
            </button>
          ) : proxima ? (
            <>
              <button
                type="button"
                onClick={() => irPara({ v: 'nova', parada: proxima.id })}
                className="flex h-14 items-center justify-center rounded-md bg-primary text-base font-bold text-primary-foreground"
              >
                Cheguei: fazer check-in
              </button>
              <button
                type="button"
                onClick={() => irPara({ v: 'nova' })}
                className="flex h-12 items-center justify-center rounded-md border border-border text-sm font-bold"
              >
                Visita fora do roteiro
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => irPara({ v: 'nova' })}
              className="flex h-14 items-center justify-center rounded-md bg-primary text-base font-bold text-primary-foreground"
            >
              Nova visita
            </button>
          )}

          {!aberta && intervalo.ligado && !emIntervalo && (
            // Lote B §37 (UX §3.6): 1 toque para começar, com "Desfazer"; só sem visita aberta (Lovable).
            <Button variant="outline" onClick={() => void intervalo.iniciar()} className="h-12 text-sm">
              <span aria-hidden>☕ </span>Intervalo
            </Button>
          )}

          <section>
            <h2 className="tag text-muted-foreground">Visitas de hoje</h2>
            {dia.visitas.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">Nenhuma visita ainda.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {[...dia.visitas].reverse().map((v) => {
                  const min = duracaoMin(v.checkin_at, v.checkout_at);
                  return (
                    <li key={v.ref} className="card-surface flex items-center justify-between gap-3 p-3">
                      <div>
                        <p className="font-bold">{v.nome}</p>
                        <p className="text-xs text-muted-foreground">
                          {hora(v.checkin_at)}
                          {min !== null ? ` · ${min} min` : ''}
                          {v.cadastrou_qr ? ' · cadastrou agora' : ''}
                          {v.fechado ? ' · estabelecimento fechado' : ''}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1 text-[11px]">
                        {v.auto_closed && <span className="rounded-sm bg-danger/15 px-1.5 py-0.5 text-danger">sem checkout</span>}
                        {!v.checkout_at && !v.auto_closed && (
                          <span className="rounded-sm bg-primary/15 px-1.5 py-0.5 text-primary">aberta</span>
                        )}
                        {v.pendente && <span className="text-muted-foreground">aguardando envio</span>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}

      {!carregando && <RetornosCampo />}
      {/* Lote C (§38): os cupons pedidos, só com a flag. */}
      {!carregando && <CuponsCampo />}

      <div className="fixed inset-x-0 bottom-0 border-t border-border bg-background/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <div className="mx-auto flex max-w-md gap-3">
          <button type="button" onClick={() => irPara({ v: 'qr' })} className="flex h-14 w-28 items-center justify-center rounded-md border border-border text-sm font-bold">
            QR code
          </button>
          {!dia.jornada ? (
            <Button onClick={() => void iniciar()} disabled={ocupado || carregando} className="h-14 flex-1 text-base">
              {ocupado ? 'Pegando a localização…' : 'Iniciar jornada'}
            </Button>
          ) : (
            <Button variant="outline" onClick={encerrar} disabled={ocupado || !!dia.visitaAberta} className="h-14 flex-1 text-base">
              Encerrar jornada
            </Button>
          )}
        </div>
        {dia.jornada && dia.visitaAberta && (
          <p className="mx-auto mt-2 max-w-md text-center text-[11px] text-muted-foreground">
            Faça o checkout da visita aberta para encerrar.
          </p>
        )}
      </div>
    </main>
  );
}
