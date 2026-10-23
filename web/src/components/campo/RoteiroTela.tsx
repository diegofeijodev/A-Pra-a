'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { CampoTopo } from '@/components/campo/CampoTopo';
import { FaixaFila } from '@/components/campo/FaixaFila';
import { AlternarListaMapa, MapaCampo } from '@/components/campo/MapaCampo';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useCampoMe } from '@/modules/campo/application/use-campo';
import { useSol } from '@/modules/campo/application/use-sol';
import { irPara } from '@/modules/campo/application/use-tela';
import { useAcoesRoteiro, useRoteiro } from '@/modules/rotas/application/use-roteiro';
import { etaTexto, faltam, periodoDaParada, porSeq, proximaParada } from '@/modules/rotas/domain/rota-local';
import { rotuloMotivo, type StopView } from '@/modules/rotas/domain/rota.schema';

const ICONE: Record<string, string> = { visitada: '✓', pendente: '', adiada: '⏭', pulada: '✕' };

function descricao(s: StopView, atual: boolean): string {
  if (s.status === 'visitada') return `feita${s.eta ? ` · ${etaTexto(s.eta)}` : ''}`;
  if (s.status === 'pulada') return `pulada: ${rotuloMotivo(s.skip_reason).toLowerCase()}`;
  if (s.status === 'adiada') return `para depois · ${s.deferred_to === 'amanha' ? 'amanhã' : 'tarde'}`;
  return atual ? `agora · ~${etaTexto(s.eta)}` : `~${etaTexto(s.eta)}`;
}

function Linha({ s, atual }: { s: StopView; atual: boolean }) {
  const icone = atual ? '▶' : ICONE[s.status];
  return (
    <li>
      <button
        type="button"
        onClick={() => irPara({ v: 'parada', id: s.id })}
        className={`card-surface flex min-h-14 w-full items-center gap-3 p-3 text-left ${atual ? 'border-primary' : ''}`}
      >
        <span className="w-6 text-center text-base" aria-hidden>
          {icone || s.seq}
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-sm ${atual ? 'font-black' : 'font-bold'}`}>{s.name}</span>
          <span className="block truncate text-sm text-muted-foreground">{descricao(s, atual)}</span>
        </span>
      </button>
    </li>
  );
}

/** Visão `roteiro` de `/campo` (UX §4.3): a lista do dia, parada atual destacada, e "Refazer rota a partir daqui". */
export function RoteiroTela() {
  const rot = useRoteiro();
  const { refazer } = useAcoesRoteiro();
  const [aberto, setAberto] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  // Lote E (UX §2.2): "Lista | Mapa" só com o mapa ligado no servidor; desligado, a tela é a de hoje.
  const mapaLigado = useCampoMe().data?.features?.map_pins === true;
  const [modo, setModo] = useState<'lista' | 'mapa'>('lista');
  const { sol } = useSol();

  const route = rot.route;
  const voltar = (
    <button type="button" onClick={() => irPara({ v: 'hoje' })} className="flex h-12 w-full items-center justify-center rounded-md border border-border text-sm font-bold">
      Voltar para Hoje
    </button>
  );

  if (rot.carregando) {
    return (
      <main className="space-y-4" aria-busy="true">
        <CampoTopo titulo="Roteiro de hoje" />
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="card-surface h-14 animate-pulse" />
        ))}
      </main>
    );
  }
  if (!route) {
    return (
      <main className="space-y-4">
        <CampoTopo titulo="Roteiro de hoje" />
        <p className="card-surface p-5 text-sm">{rot.erro ? 'Não carregamos o roteiro.' : 'Sem roteiro para hoje.'}</p>
        {voltar}
      </main>
    );
  }

  const atual = proximaParada(route.stops);
  const visiveis = [...route.stops].sort(porSeq).filter((s) => s.status !== 'descartada' && s.kind === 'planejada');
  const reservas = [...route.stops].sort(porSeq).filter((s) => s.kind === 'reserva' && s.status === 'pendente');
  const manha = visiveis.filter((s) => periodoDaParada(s, route.params) === 'manha');
  const tarde = visiveis.filter((s) => periodoDaParada(s, route.params) === 'tarde');
  const restantes = faltam(route.stops).length;

  async function confirmarRefazer() {
    if (!route) return;
    setOcupado(true);
    try {
      const ultima = [...route.stops].sort(porSeq).filter((s) => s.status === 'visitada').at(-1);
      const { semGps } = await refazer(ultima ? { lat: ultima.lat, lng: ultima.lng } : route.start);
      setAberto(false);
      toast(
        navigator.onLine
          ? semGps
            ? 'Refazendo a rota a partir da última parada (sem a sua localização).'
            : 'Refazendo a rota…'
          : 'Rota refeita sem internet. Pode haver caminho melhor; refazemos quando voltar o sinal.',
      );
    } catch {
      toast.error('Não foi possível refazer. A ordem atual continua.');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <main className="space-y-5 pb-28">
      <CampoTopo titulo="Roteiro de hoje" />
      <FaixaFila />
      {rot.guardado && (
        <p role="status" className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
          Lista guardada neste aparelho. O mapa e os horários novos voltam com o sinal.
        </p>
      )}
      {mapaLigado && <AlternarListaMapa modo={modo} onModo={setModo} />}
      {mapaLigado && modo === 'mapa' ? (
        <MapaCampo paradas={faltam(route.stops)} escuro={!sol} />
      ) : visiveis.length === 0 ? (
        <p className="card-surface p-5 text-sm">Nenhuma parada pendente. Você fez tudo.</p>
      ) : (
        <>
          <section aria-label="Manhã" className="space-y-2">
            <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">MANHÃ</h2>
            <ul className="space-y-2">{manha.map((s) => <Linha key={s.id} s={s} atual={s.id === atual?.id} />)}</ul>
          </section>
          <p className="rounded-md border border-border p-3 text-center text-sm text-muted-foreground">
            Almoço · {route.params.almoco_inicio.replace(':', 'h')} às {route.params.almoco_fim.replace(':', 'h')}
          </p>
          <section aria-label="Tarde" className="space-y-2">
            <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">TARDE</h2>
            <ul className="space-y-2">{tarde.map((s) => <Linha key={s.id} s={s} atual={s.id === atual?.id} />)}</ul>
          </section>
        </>
      )}
      {reservas.length > 0 && (
        <section aria-label="Reserva" className="space-y-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">RESERVA</h2>
          <p className="text-sm text-muted-foreground">Entram no lugar de quem você pular.</p>
          <ul className="space-y-2">{reservas.map((s) => <Linha key={s.id} s={s} atual={false} />)}</ul>
        </section>
      )}
      {voltar}

      <div className="fixed inset-x-0 bottom-0 border-t border-border bg-background/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <div className="mx-auto max-w-md">
          <Button onClick={() => setAberto(true)} disabled={restantes === 0} className="h-14 w-full text-base">
            Refazer rota a partir daqui
          </Button>
        </div>
      </div>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Refazer a rota?</DialogTitle>
            <DialogDescription>
              Refazer a ordem das {restantes} paradas que faltam, a partir de onde você está? As já feitas não mudam.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setAberto(false)} className="h-12">
              Cancelar
            </Button>
            <Button onClick={() => void confirmarRefazer()} disabled={ocupado} className="h-12">
              {ocupado ? 'Refazendo a rota…' : 'Refazer rota'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
