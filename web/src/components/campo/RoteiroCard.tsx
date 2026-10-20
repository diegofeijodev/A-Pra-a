'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { NavegarLinks, ParadaAcoes } from '@/components/campo/ParadaAcoes';
import { useDia } from '@/modules/campo/application/use-campo';
import { irPara } from '@/modules/campo/application/use-tela';
import { campoGerarRota } from '@/modules/campo/infrastructure/campo.api';
import { hora } from '@/modules/campo/domain/formatos';
import { ErroGps, lerPosicao } from '@/modules/campo/infrastructure/gps';
import { useRoteiro } from '@/modules/rotas/application/use-roteiro';
import { etaTexto, faltam, minutosSp, proximaParada, ritmoLocal, ritmoTexto, trechoTexto, velocidadeDoRoteiro } from '@/modules/rotas/domain/rota-local';
import { apiErrorMessage } from '@/modules/shared/infrastructure/http';

/**
 * Roteiro dentro da tela Hoje (UX §4.2): "12 de 30", ritmo com a conta, próxima parada com
 * Maps/Waze e Pular / Deixar para depois. Desabilitado pela equipe = não renderiza nada.
 */
export function RoteiroCard() {
  const rot = useRoteiro();
  const { dia } = useDia();
  const qc = useQueryClient();
  const [gerando, setGerando] = useState(false);

  async function montarMeuDia() {
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
    return (
      <section className="card-surface space-y-2 p-4">
        <p className="text-sm">Sem roteiro para hoje. Você pode fazer visitas livres; peça à equipe para montar um.</p>
        {rot.podeGerar && (
          <button type="button" disabled={gerando} onClick={() => void montarMeuDia()} className="h-12 w-full rounded-md border border-border text-sm font-bold">
            {gerando ? 'Montando…' : 'Montar meu dia'}
          </button>
        )}
      </section>
    );
  }

  const agoraMin = minutosSp(Date.now());
  const feitas = dia.contadores.feitas; // sem os "fechados" (§30.1)
  const meta = route.params.meta_diaria;
  const ritmo = ritmoTexto(ritmoLocal(route.params, feitas, agoraMin), route.params, agoraMin);
  const proxima = proximaParada(route.stops);
  const restantes = faltam(route.stops).length;
  const pct = Math.min(100, Math.round((feitas / Math.max(meta, 1)) * 100));

  return (
    <div className="space-y-3">
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

      <section className="card-surface space-y-2 p-4" aria-label="Meta do dia">
        <p className="text-lg font-black">
          {feitas} de {meta} visitas
        </p>
        <div role="progressbar" aria-valuemin={0} aria-valuemax={meta} aria-valuenow={Math.min(feitas, meta)} className="h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
        </div>
        <p className={`text-sm font-bold ${ritmo.ok ? 'text-success' : 'text-warning'}`}>{ritmo.titulo}</p>
        <p className="text-sm text-muted-foreground">({ritmo.conta})</p>
        <p className="text-sm" data-testid="modo-rota-consultor">
          <strong>{route.travel_mode === 'carro' ? 'Roteiro de carro' : 'Roteiro a pé'}</strong>
          <span className="text-muted-foreground"> — {route.travel?.text ?? `A pé: ${String(route.params.velocidade_kmh).replace('.', ',')} km/h`}</span>
        </p>
      </section>

      {proxima ? (
        <section className="card-surface space-y-3 p-4" aria-label="Próxima parada">
          <p className="text-sm font-bold uppercase tracking-wide text-muted-foreground">PRÓXIMA PARADA · {proxima.eta ? `chega por volta das ${etaTexto(proxima.eta)}` : 'deixada para a tarde'}</p>
          <div>
            <p className="text-lg font-black">{proxima.name}</p>
            <p className="text-sm">{proxima.address || 'Sem endereço'}</p>
            <p className="text-sm text-muted-foreground">{trechoTexto(proxima.distance_m, velocidadeDoRoteiro(route), route.travel_mode)} (estimado, desde a parada anterior)</p>
          </div>
          <NavegarLinks parada={proxima} />
          <ParadaAcoes parada={proxima} params={route.params} />
        </section>
      ) : (
        <section className="card-surface p-4">
          <p className="text-sm">Nenhuma parada pendente no roteiro. {feitas >= meta ? 'Meta do dia batida.' : 'Você pode fazer visitas livres.'}</p>
        </section>
      )}

      <button
        type="button"
        onClick={() => irPara({ v: 'roteiro' })}
        className="flex h-12 w-full items-center justify-between rounded-md border border-border px-4 text-sm font-bold"
      >
        <span>Ver as {restantes} que faltam</span>
        <span aria-hidden>›</span>
      </button>
    </div>
  );
}
