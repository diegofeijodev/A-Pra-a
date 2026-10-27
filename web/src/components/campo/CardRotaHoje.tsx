'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useCampoMe, useDia } from '@/modules/campo/application/use-campo';
import { irPara } from '@/modules/campo/application/use-tela';
import { campoGerarRota } from '@/modules/campo/infrastructure/campo.api';
import { hora } from '@/modules/campo/domain/formatos';
import { cartaoDaRota } from '@/modules/campo/domain/hoje-tela';
import { ErroGps, lerPosicao } from '@/modules/campo/infrastructure/gps';
import { useRoteiro } from '@/modules/rotas/application/use-roteiro';
import { minutosSp, pausasEmMinutos, ritmoLocal, ritmoTexto } from '@/modules/rotas/domain/rota-local';
import { apiErrorMessage } from '@/modules/shared/infrastructure/http';

/** [Próximos dias ›] (lote D §39.7): o calendário "Minhas rotas" da Lovable; só com os planos de rota ligados no servidor. */
export function BotaoProximosDias() {
  const ligado = useCampoMe().data?.features?.route_plans === true;
  if (!ligado) return null;
  return (
    <Button variant="outline" onClick={() => irPara({ v: 'proximos' })} className="h-12 w-full justify-between px-4 text-sm font-semibold">
      <span>Próximos dias</span>
      <span aria-hidden>›</span>
    </Button>
  );
}

/** [Montar meu dia] (contrato §23.3): só quando a equipe deixa o representante montar o próprio roteiro. */
export function BotaoMontarMeuDia({ className = '' }: { className?: string }) {
  const rot = useRoteiro();
  const qc = useQueryClient();
  const [gerando, setGerando] = useState(false);
  if (!rot.podeGerar) return null;
  async function montar() {
    setGerando(true);
    try {
      const p = await lerPosicao();
      await campoGerarRota({ client_id: crypto.randomUUID(), lat: p.lat, lng: p.lng });
      await qc.refetchQueries({ queryKey: ['campo', 'route'] });
    } catch (e) {
      if (e instanceof ErroGps) toast.error('Ligue a localização para montar o seu dia.');
      else toast.error(apiErrorMessage(e, 'Não foi possível montar o dia agora.'));
    } finally {
      setGerando(false);
    }
  }
  return (
    <Button variant="outline" disabled={gerando} onClick={() => void montar()} className={`h-12 w-full text-sm font-semibold ${className}`}>
      {gerando ? 'Montando…' : 'Montar meu dia'}
    </Button>
  );
}

/** Avisos do roteiro guardado no aparelho e da rota refeita sem sinal (ficam logo acima do cartão, UX §4.12). */
export function AvisosDoRoteiro() {
  const rot = useRoteiro();
  return (
    <>
      {rot.guardado && (
        <p role="status" className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
          Mostrando o último roteiro guardado às {hora(new Date(rot.guardado.hora).toISOString())}.{' '}
          <button type="button" onClick={rot.recarregar} className="font-bold underline">
            Tentar de novo
          </button>
        </p>
      )}
      {rot.refazendoOffline && (
        <p role="status" className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
          Rota refeita sem internet. Pode haver caminho melhor; refazemos quando voltar o sinal.
        </p>
      )}
    </>
  );
}

/**
 * A rota de hoje na visão Hoje, no `CardRota` da Lovable (UX §4.12): bolinha, nome, "{n} paradas", percurso, modo e tempo previsto;
 * no lugar do "Clique para ver os clientes", a nossa linha "Feitas: 4 de 30 · {ritmo}". [Abrir roteiro da rota] leva à visão do
 * roteiro, onde ficam a próxima parada, Maps/Waze, pular e deixar para depois. Desabilitado pela equipe = não renderiza nada.
 */
export function CardRotaHoje({ fechadoContaNaMeta = false }: { fechadoContaNaMeta?: boolean } = {}) {
  const rot = useRoteiro();
  const { dia } = useDia(fechadoContaNaMeta);

  if (!rot.habilitado || rot.carregando) return null;
  const route = rot.route;

  if (!route) {
    if (rot.erro) {
      return (
        <section className="card-surface space-y-2 p-4" role="alert">
          <p className="text-sm">Não carregamos o roteiro. Suas visitas continuam funcionando.</p>
          <button type="button" onClick={rot.recarregar} className="h-12 w-full rounded-md border border-border text-sm font-bold">
            Tentar de novo
          </button>
        </section>
      );
    }
    // O vazio da Lovable ("Nenhuma rota neste dia") com o nosso texto: sem rota, a visita é livre.
    return (
      <section className="space-y-3 card-surface p-8 text-center">
        <p className="font-medium">Nenhuma rota hoje</p>
        <p className="text-sm text-muted-foreground">Você pode visitar quem estiver no caminho. Quando a equipe montar sua rota, ela aparece aqui.</p>
        <BotaoProximosDias />
        <BotaoMontarMeuDia />
      </section>
    );
  }

  const c = cartaoDaRota(route);
  const agoraMin = minutosSp(Date.now());
  const feitas = dia.contadores.feitas; // sem os "fechados" (§30.1)
  const meta = route.params.meta_diaria;
  const ritmo = ritmoTexto(ritmoLocal(route.params, feitas, agoraMin, pausasEmMinutos(dia.intervalos, Date.now())), route.params, agoraMin);

  return (
    <div className="space-y-3">
      <AvisosDoRoteiro />
      <section aria-label="Rota de hoje" className="space-y-2 card-surface p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-2 font-medium">
            <span aria-hidden className="h-3 w-3 rounded-full bg-primary" /> Rota de hoje
          </p>
          <Badge variant="secondary">{c.paradas === 1 ? '1 parada' : `${c.paradas} paradas`}</Badge>
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>
            Percurso: <b className="text-foreground">{c.percurso}</b>
          </span>
          <span>
            Modo: <b className="text-foreground">{c.modo}</b>
          </span>
          {c.tempoPrevisto && (
            <span>
              Tempo previsto: <b className="text-foreground">{c.tempoPrevisto}</b>
            </span>
          )}
        </div>
        <p className="text-sm">
          Feitas: {feitas} de {meta}
          {dia.jornada && (
            <>
              {' · '}
              <span className={`font-semibold ${ritmo.ok ? 'text-success' : 'text-warning'}`}>{ritmo.titulo}</span>
            </>
          )}
        </p>
        <details className="text-xs text-muted-foreground">
          <summary className="min-h-11 cursor-pointer py-3">ⓘ Como contamos</summary>
          <ul className="list-disc space-y-1 pl-5">
            <li>Feitas: visitas de hoje que contam na meta (sem os estabelecimentos fechados); meta do dia = {meta}.</li>
            {dia.jornada && <li>Ritmo: {ritmo.conta}.</li>}
            {c.conta.map((l) => (
              <li key={l}>{l}</li>
            ))}
            {route.travel?.text && <li>Deslocamento: {route.travel.text}.</li>}
          </ul>
        </details>
        <Button onClick={() => irPara({ v: 'roteiro' })} className="h-12 w-full text-base">
          Abrir roteiro da rota
        </Button>
      </section>
      <BotaoProximosDias />
    </div>
  );
}
