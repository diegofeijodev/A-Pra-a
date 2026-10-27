'use client';

import { ArrowLeft, CheckCircle2, Coffee, MapPin, Navigation, Play, Square } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { AvisoGps } from '@/components/campo/AvisoGps';
import { AvisosDoRoteiro, BotaoMontarMeuDia } from '@/components/campo/CardRotaHoje';
import { VisitaEmAndamento } from '@/components/campo/Cronometro';
import { PracaDoDia } from '@/components/campo/PracaDoDia';
import { ResultadoDoDiaCartao } from '@/components/campo/ResumoDiaTela';
import { ChegueiBotao } from '@/components/campo/simples/ChegueiBotao';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { useCampoMe, useDia } from '@/modules/campo/application/use-campo';
import { useFluxo } from '@/modules/campo/application/use-fluxo';
import { useIntervalo } from '@/modules/campo/application/use-intervalo';
import { useJornada } from '@/modules/campo/application/use-jornada';
import { irPara } from '@/modules/campo/application/use-tela';
import type { VisitView } from '@/modules/campo/domain/campo.types';
import {
  cadastrosDoDia,
  estadoDoDia,
  paradasDaRota,
  progressoDoDia,
  ROTULO_ESTADO,
  seloDaParada,
  tempoMedioMin,
} from '@/modules/campo/domain/hoje-tela';
import { useAcoesRoteiro, useRoteiro } from '@/modules/rotas/application/use-roteiro';
import { etaTexto, faltam, linkMaps, linkWaze, minutosSp, pausasEmMinutos, porSeq, proximaParada, ritmoLocal, ritmoTexto } from '@/modules/rotas/domain/rota-local';
import { rotuloMotivo, type StopView } from '@/modules/rotas/domain/rota.schema';

const botaoNavegar = 'inline-flex min-h-11 items-center gap-1 rounded-md border border-input bg-background px-3 text-sm font-medium';

/** A linha de apoio da parada: endereço + a hora prevista ou o que aconteceu com ela (pulada, deixada para depois). */
function apoioDaParada(s: StopView): string {
  const situacao =
    s.status === 'pulada'
      ? `pulada: ${rotuloMotivo(s.skip_reason).toLowerCase()}`
      : s.status === 'adiada'
        ? s.deferred_to === 'amanha'
          ? 'deixada para amanhã'
          : 'deixada para a tarde'
        : s.status === 'visitada'
          ? ''
          : s.eta
            ? `chega por volta das ${etaTexto(s.eta)}`
            : '';
  return [s.address || 'Sem endereço', situacao].filter(Boolean).join(' · ');
}

/**
 * "Cheguei no cliente" (texto da Lovable, UX §4.13): no simples é o `ChegueiBotao` (abre a câmera direto; a foto É a chegada, sem o
 * diálogo "Chegada" da Lovable [desvio: campo]); no completo leva à nossa tela de chegada com foto (`?v=nova&parada=`).
 */
function ChegueiNoCliente({ s, simples, largo = false }: { s: StopView; simples: boolean; largo?: boolean }) {
  const texto = (
    <>
      <MapPin className="mr-1 h-4 w-4" aria-hidden />
      Cheguei no cliente
    </>
  );
  if (simples) {
    return (
      <ChegueiBotao alvo={{ nome: s.name, lead_id: s.lead_id }} pequeno={!largo} className={largo ? 'w-full' : ''}>
        {texto}
      </ChegueiBotao>
    );
  }
  return (
    <Button onClick={() => irPara({ v: 'nova', parada: s.id })} className={largo ? 'h-12 w-full text-base' : 'h-12 text-sm'}>
      {texto}
    </Button>
  );
}

function LinhaParada({
  s,
  n,
  sugerida,
  podeChegar,
  simples,
  visita,
}: {
  s: StopView;
  n: number;
  sugerida: boolean;
  podeChegar: boolean;
  simples: boolean;
  visita: VisitView | undefined;
}) {
  const visitada = s.status === 'visitada';
  const selo = visitada ? seloDaParada(visita) : null;
  const dados = { lat: s.lat, lng: s.lng, address: s.address, name: s.name };
  return (
    <li className={`rounded-2xl bg-card p-3 shadow-card ${sugerida ? 'ring-2 ring-primary' : ''} ${visitada ? 'opacity-70' : ''}`}>
      <div className="flex items-start gap-3">
        <span aria-hidden className="mt-2.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
          {n}
        </span>
        <div className="min-w-0 flex-1">
          {/* Tocar no nome abre a parada (nossa): ligar, pular, deixar para depois. */}
          <button type="button" onClick={() => irPara({ v: 'parada', id: s.id })} className="block min-h-11 w-full text-left font-medium">
            {s.name}
          </button>
          <p className="text-xs text-muted-foreground">{apoioDaParada(s)}</p>
          {selo && (
            <Badge variant="secondary" className="mt-1 gap-1">
              <CheckCircle2 className="h-3 w-3" style={selo.cor ? { color: selo.cor } : undefined} aria-hidden />
              {selo.rotulo}
            </Badge>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            <a href={linkMaps(dados)} target="_blank" rel="noopener noreferrer" className={botaoNavegar}>
              <Navigation className="h-3.5 w-3.5" aria-hidden />
              Google Maps
            </a>
            <a href={linkWaze(dados)} target="_blank" rel="noopener noreferrer" className={botaoNavegar}>
              Waze
            </a>
            {podeChegar && <ChegueiNoCliente s={s} simples={simples} />}
          </div>
        </div>
      </div>
    </li>
  );
}

/**
 * Visão `roteiro` de `/campo` no desenho da Lovable (`roteiro.$rotaId.tsx`, redesenho E5c, UX §4.13), a MESMA para os dois fluxos:
 * cartão fixo com a situação do dia, a barra de progresso e os botões da jornada; "Resultado do seu dia" depois de encerrar; a
 * visita aberta; o "Próximo sugerido" e a lista numerada com Google Maps, Waze e "Cheguei no cliente". Por trás, as nossas ações
 * de sempre (fila, `irPara`, `enfileirar`). Sem rota, "Dia sem rota" com a meta. O mapa é a aba "Mapa" de baixo.
 */
export function RoteiroTela({ simples }: { simples: boolean }) {
  const { config } = useFluxo();
  const fechadoConta = simples ? config.fechado_conta_na_meta : false;
  const { dia, hoje, carregando } = useDia(fechadoConta);
  const rot = useRoteiro();
  const me = useCampoMe();
  const intervalo = useIntervalo();
  const j = useJornada({ simples, fechadoContaNaMeta: fechadoConta });
  const { refazer } = useAcoesRoteiro();
  const [refazerAberto, setRefazerAberto] = useState(false);
  const [refazendo, setRefazendo] = useState(false);

  const voltar = (
    <button type="button" onClick={() => irPara({ v: 'hoje' })} className="inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground">
      <ArrowLeft className="h-4 w-4" aria-hidden /> Minhas rotas
    </button>
  );

  if (carregando || rot.carregando) {
    return (
      <main className="space-y-4" aria-busy="true">
        {voltar}
        <h1 className="sr-only">Roteiro da rota</h1>
        <div className="h-36 animate-pulse rounded-2xl bg-muted" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-2xl bg-muted" />
        ))}
      </main>
    );
  }

  const route = rot.habilitado ? rot.route : null;
  const estado = estadoDoDia(dia, intervalo.ligado);
  const aberta = dia.visitaAberta;
  const emRota = estado === 'em_rota' && !aberta;
  const paradas = route ? paradasDaRota(route.stops) : [];
  const reservas = route ? [...route.stops].sort(porSeq).filter((s) => s.kind === 'reserva' && s.status === 'pendente') : [];
  const proxima = route ? proximaParada(route.stops) : null;
  const restantes = route ? faltam(route.stops).length : 0;
  const goal = hoje?.goal ?? null;
  const prog = progressoDoDia({
    feitos: route ? paradas.filter((s) => s.status === 'visitada').length : dia.contadores.feitas,
    total: route ? paradas.length : (goal?.params.meta_diaria ?? null),
    cadastros: cadastrosDoDia(dia.contadores),
    tempoMedio: tempoMedioMin(dia.visitas),
    comRota: !!route,
  });
  // O nosso ritmo (relógio do roteiro ou da meta), com a conta no "ⓘ": só com o dia aberto e em dia de trabalho.
  const paramsRitmo = route?.params ?? (goal?.dia_de_trabalho ? goal.params : null);
  const agora = Date.now();
  const ritmo =
    paramsRitmo && dia.jornada
      ? ritmoTexto(ritmoLocal(paramsRitmo, dia.contadores.feitas, minutosSp(agora), pausasEmMinutos(dia.intervalos, agora)), paramsRitmo, minutosSp(agora))
      : null;
  const visitaDaParada = (leadId: string) => [...(hoje?.visits ?? [])].reverse().find((v) => v.lead_id === leadId);
  const comCronometro = me.data?.features?.checklist === true;
  const nomeDoIniciar = simples ? 'Iniciar o dia' : 'Iniciar jornada';

  async function confirmarRefazer() {
    if (!route) return;
    setRefazendo(true);
    try {
      const ultima = [...route.stops].sort(porSeq).filter((s) => s.status === 'visitada').at(-1);
      const { semGps } = await refazer(ultima ? { lat: ultima.lat, lng: ultima.lng } : route.start);
      setRefazerAberto(false);
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
      setRefazendo(false);
    }
  }

  return (
    <main className="space-y-4 pb-8">
      {voltar}
      {j.gps && <AvisoGps motivo={j.gps} onFechar={j.fecharGps} />}
      <AvisosDoRoteiro />

      {/* Cartão fixo da Lovable: gruda logo abaixo do topo da casca (faixa azul + fila), qualquer que seja a altura dele. */}
      <section aria-label="Andamento do dia" className="sticky top-[var(--campo-topo)] z-10 space-y-2 rounded-2xl bg-card p-4 shadow-card">
        <div className="flex items-center justify-between gap-2">
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <span aria-hidden className="h-3 w-3 shrink-0 rounded-full bg-primary" />
            {route ? 'Rota de hoje' : 'Dia sem rota'}
          </h1>
          <Badge variant={estado === 'em_rota' ? 'default' : 'secondary'}>{ROTULO_ESTADO[estado]}</Badge>
        </div>
        <Progress value={prog.pct} aria-label={route ? 'Clientes visitados' : 'Visitas da meta'} />
        <p className="text-sm text-muted-foreground">{prog.linha}</p>
        {ritmo && (
          <details className="text-xs">
            <summary className={`min-h-11 cursor-pointer py-3 font-semibold ${ritmo.ok ? 'text-success' : 'text-warning'}`}>
              {ritmo.titulo} <span className="font-normal text-muted-foreground">ⓘ</span>
            </summary>
            <p className="text-muted-foreground">({ritmo.conta})</p>
          </details>
        )}
        {estado === 'nao_iniciada' && (
          <div className="space-y-2">
            {j.escolhePraca && me.data?.pracas && <PracaDoDia pracas={me.data.pracas} marcada={j.marcada} onEscolher={j.escolherPraca} />}
            <Button onClick={() => void j.iniciar()} disabled={j.ocupado} className="h-12 w-full text-base">
              <Play className="mr-2 h-5 w-5" aria-hidden />
              {j.rotuloIniciar}
            </Button>
          </div>
        )}
        {emRota && (
          <div className="flex flex-wrap gap-2">
            {intervalo.ligado && (
              <Button variant="outline" onClick={() => void intervalo.iniciar()} className="h-12 flex-1 text-sm">
                <Coffee className="mr-2 h-4 w-4" aria-hidden />
                Iniciar intervalo
              </Button>
            )}
            <Button variant="outline" onClick={j.encerrar} disabled={j.ocupado} className="h-12 flex-1 text-sm">
              <Square className="mr-2 h-4 w-4" aria-hidden />
              {j.rotuloEncerrar}
            </Button>
          </div>
        )}
        {estado === 'intervalo' && dia.intervaloAberto && (
          <Button onClick={() => void intervalo.voltar(dia.intervaloAberto!)} className="h-12 w-full text-base">
            <Coffee className="mr-2 h-5 w-5" aria-hidden />
            Encerrar intervalo
          </Button>
        )}
      </section>

      {estado === 'encerrada' && <ResultadoDoDiaCartao />}

      {aberta && (
        <VisitaEmAndamento nome={aberta.nome} desde={aberta.checkin_at} comCronometro={comCronometro}>
          <Button onClick={() => irPara({ v: 'visita', ref: aberta.ref })} className="h-12 w-full text-base">
            Continuar visita
          </Button>
        </VisitaEmAndamento>
      )}

      {emRota && proxima && (
        <div className="space-y-2 rounded-xl bg-secondary p-3 text-sm">
          <p>
            Próximo sugerido: <b>{proxima.name}</b>
          </p>
          {/* [desvio: zona do polegar] 1 toque até a câmera, sem rolar a lista. */}
          <ChegueiNoCliente s={proxima} simples={simples} largo />
        </div>
      )}
      {estado === 'nao_iniciada' && <p className="text-center text-sm text-muted-foreground">Toque em “{nomeDoIniciar}” para liberar as visitas.</p>}

      {route && (
        <p className="text-xs text-muted-foreground">
          Almoço · {route.params.almoco_inicio.replace(':', 'h')} às {route.params.almoco_fim.replace(':', 'h')}
        </p>
      )}

      {!route && rot.erro && (
        <section className="card-surface space-y-2 p-4" role="alert">
          <p className="text-sm">Não carregamos o roteiro. Suas visitas continuam funcionando.</p>
          <button type="button" onClick={rot.recarregar} className="h-12 w-full rounded-md border border-border text-sm font-bold">
            Tentar de novo
          </button>
        </section>
      )}

      {route &&
        (paradas.length === 0 ? (
          <p className="card-surface p-5 text-sm">A rota de hoje está sem paradas.</p>
        ) : (
          <ol aria-label="Clientes da rota" className="space-y-2">
            {paradas.map((s, i) => (
              <LinhaParada
                key={s.id}
                s={s}
                n={i + 1}
                sugerida={emRota && s.id === proxima?.id}
                // O sugerido já tem o botão no quadro de cima: dois campos de foto com o mesmo nome confundiriam o leitor de tela.
                podeChegar={emRota && s.id !== proxima?.id && (s.status === 'pendente' || s.status === 'adiada')}
                simples={simples}
                visita={visitaDaParada(s.lead_id)}
              />
            ))}
          </ol>
        ))}

      {reservas.length > 0 && (
        <section aria-label="Reserva" className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground">Reserva</h2>
          <p className="text-sm text-muted-foreground">Entram no lugar de quem você pular.</p>
          <ol className="space-y-2">
            {reservas.map((s, i) => (
              <LinhaParada key={s.id} s={s} n={paradas.length + i + 1} sugerida={false} podeChegar={false} simples={simples} visita={undefined} />
            ))}
          </ol>
        </section>
      )}

      {emRota &&
        (route ? (
          <Button variant="outline" onClick={() => irPara({ v: 'nova' })} className="h-12 w-full text-sm font-semibold">
            Visita fora do roteiro
          </Button>
        ) : (
          <div className="space-y-2">
            <Button onClick={() => irPara({ v: 'nova' })} className="h-12 w-full text-base">
              Visita no caminho
            </Button>
            <BotaoMontarMeuDia />
          </div>
        ))}

      {/* Nosso: refazer a ordem das que faltam a partir de onde ele está (completo, como antes). */}
      {!simples && route && (
        <Button variant="outline" onClick={() => setRefazerAberto(true)} disabled={restantes === 0} className="h-12 w-full text-sm">
          Refazer rota a partir daqui
        </Button>
      )}

      <Dialog open={refazerAberto} onOpenChange={setRefazerAberto}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Refazer a rota?</DialogTitle>
            <DialogDescription>
              Refazer a ordem das {restantes} paradas que faltam, a partir de onde você está? As já feitas não mudam.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRefazerAberto(false)} className="h-12">
              Cancelar
            </Button>
            <Button onClick={() => void confirmarRefazer()} disabled={refazendo} className="h-12">
              {refazendo ? 'Refazendo a rota…' : 'Refazer rota'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
