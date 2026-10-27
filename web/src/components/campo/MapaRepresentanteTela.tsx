'use client';

import { MapaCampo } from '@/components/campo/MapaCampo';
import { useCampoMe } from '@/modules/campo/application/use-campo';
import { useOnline } from '@/modules/campo/application/use-online';
import { useRoteiro } from '@/modules/rotas/application/use-roteiro';

/**
 * Aba "Mapa" do representante (`?v=mapa`, UX §4.14): os clientes dele — os da rota e os que ele visitou (contrato §34.4) — com a
 * situação de cada um. Só com `features.map_pins` do `/me` (nunca sondando a rota); precisa de sinal, as visitas não.
 */
export function MapaRepresentanteTela() {
  const me = useCampoMe();
  const online = useOnline();
  const rot = useRoteiro();
  const ligado = me.data?.features?.map_pins === true;

  return (
    <main className="space-y-4">
      <div>
        <h1 className="text-3xl font-semibold">Mapa</h1>
        <p className="text-muted-foreground">Seus clientes: os da sua rota e os que você visitou. Cor e símbolo indicam a situação.</p>
      </div>
      {!me.data ? (
        <div aria-busy="true" className="h-[60vh] animate-pulse rounded-lg bg-muted" />
      ) : !ligado ? (
        <p className="card-surface p-5 text-sm">O mapa ainda não está ligado neste servidor.</p>
      ) : !online ? (
        <p role="status" className="card-surface p-5 text-sm">
          O mapa precisa de internet. Suas visitas continuam funcionando: a lista está em Hoje › Roteiro. O mapa volta sozinho quando o
          sinal voltar.
        </p>
      ) : (
        // As paradas de hoje: tocar no pino de uma delas abre a parada.
        <MapaCampo paradas={rot.route?.stops ?? []} escuro={false} />
      )}
    </main>
  );
}
