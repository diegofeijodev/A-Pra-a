'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { AvisoGps } from '@/components/campo/AvisoGps';
import { CampoTopo } from '@/components/campo/CampoTopo';
import { FaixaFila } from '@/components/campo/FaixaFila';
import { Button } from '@/components/ui/button';
import { useCampoSession } from '@/modules/campo/application/campo-session.store';
import { useDia } from '@/modules/campo/application/use-campo';
import { enfileirar } from '@/modules/campo/application/use-fila';
import type { Posicao } from '@/modules/campo/domain/campo.types';
import { duracaoMin, hora } from '@/modules/campo/domain/formatos';
import type { MotivoGps } from '@/modules/campo/domain/gps-mensagens';
import { ErroGps, lerPosicao } from '@/modules/campo/infrastructure/gps';
import { irPara } from '@/modules/campo/application/use-tela';

/** Visão `hoje` de `/campo`:  do consultor (spec §8.1): iniciar/encerrar, visitas do dia, contadores, QR a um toque. */
export function HojeTela() {
  const consultantId = useCampoSession((s) => s.session?.consultant.id ?? '');
  const { dia, carregando } = useDia();
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

  const iniciar = () =>
    comPosicao((p) => enfileirar({ kind: 'start', payload: { client_id: crypto.randomUUID(), ...p } }, consultantId));

  const encerrar = () => {
    if (!window.confirm('Encerrar a jornada de hoje? A localização para de ser registrada.')) return;
    void comPosicao((p) => enfileirar({ kind: 'end', payload: p }, consultantId));
  };

  const aberta = dia.visitaAberta;

  return (
    <main className="space-y-5">
      <CampoTopo titulo="Hoje" />
      <FaixaFila />
      {gps && <AvisoGps motivo={gps} onFechar={() => setGps(null)} />}

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
          <section className="grid grid-cols-2 gap-3">
            <div className="card-surface p-4">
              <p className="text-3xl font-black">{dia.contadores.visitas}</p>
              <p className="text-xs text-muted-foreground">{dia.contadores.visitas === 1 ? 'visita hoje' : 'visitas hoje'}</p>
            </div>
            <div className="card-surface p-4">
              <p className="text-3xl font-black">{dia.contadores.cadastrou_qr}</p>
              <p className="text-xs text-muted-foreground">cadastrou agora</p>
            </div>
          </section>

          {aberta ? (
            <button
              type="button"
              onClick={() => irPara({ v: 'visita', ref: aberta.ref })}
              className="flex h-14 items-center justify-center rounded-md bg-primary px-4 text-center text-base font-bold text-primary-foreground"
            >
              Continuar visita: {aberta.nome}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => irPara({ v: 'nova' })}
              className="flex h-14 items-center justify-center rounded-md bg-primary text-base font-bold text-primary-foreground"
            >
              Nova visita
            </button>
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
