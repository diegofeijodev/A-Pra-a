'use client';

import { ListaClientes } from '@/components/praca/ListaClientes';
import { useConfigLovable, useFeaturesLovable } from '@/modules/painel/application/use-painel';

/**
 * Clientes (Lovable `clientes.tsx`, UX §4.4, arquitetura §5 E5.3): só a lista. O Mapa é página própria (`ROTA.mapa`) e o Mapa de
 * calor é um link dentro dele. O endereço antigo do Mapa (`/consultores/clientes?modo=mapa`, o do menu até a E5) leva ao Mapa pelo
 * 307 do `next.config.ts` (E7). Só com FIELD_MAP_PINS_ENABLED.
 */
export default function ClientesPage() {
  const cfg = useConfigLovable();
  const features = useFeaturesLovable();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-semibold">Clientes</h1>
        <p className="text-muted-foreground">Clientes já visitados aparecem aqui com o resultado da visita.</p>
      </div>
      {cfg.isPending ? (
        <div aria-busy="true" className="h-48 animate-pulse rounded-2xl bg-muted" />
      ) : !features.map_pins ? (
        <p className="rounded-2xl bg-card p-5 text-sm shadow-card">Este recurso ainda não está ligado neste servidor.</p>
      ) : (
        <ListaClientes />
      )}
    </div>
  );
}
