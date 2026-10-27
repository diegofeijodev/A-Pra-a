'use client';

import { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';
import { TILES_URL, tilesOptions } from '@/lib/map-tiles';
import type { PlanItem } from '@/modules/planos/domain/planos';

/**
 * Mapa das rotas de uma geração (UX §3.4; Lovable `MapaRotas.tsx`): uma linha colorida por rota, na ordem das paradas, e um
 * ponto por parada; a rota escolhida fica mais grossa. Mapa aberto (OSM). Entra por
 * `next/dynamic({ ssr: false })` e só quando a pessoa pede ("Ver no mapa"). Cor nunca sozinha: o nome está no cartão.
 */
export default function RotasMapa({ itens, destaque }: { itens: PlanItem[]; destaque: string | null }) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import('leaflet').Map | null>(null);
  const LRef = useRef<typeof import('leaflet') | null>(null);
  const grupoRef = useRef<import('leaflet').LayerGroup | null>(null);
  const dados = useRef({ itens, destaque });
  dados.current = { itens, destaque };

  function desenhar(enquadrar: boolean) {
    const L = LRef.current;
    const map = mapRef.current;
    const grupo = grupoRef.current;
    if (!L || !map || !grupo) return;
    grupo.clearLayers();
    const todos: [number, number][] = [];
    for (const it of dados.current.itens) {
      const pts = it.stops.map((s) => [s.lat, s.lng] as [number, number]);
      todos.push(...pts);
      const forte = dados.current.destaque === it.id;
      if (pts.length > 1) L.polyline(pts, { color: it.color, weight: forte ? 6 : 3, opacity: forte ? 1 : 0.8 }).addTo(grupo);
      for (const p of pts) L.circleMarker(p, { radius: forte ? 6 : 4, weight: 1, color: '#ffffff', fillColor: it.color, fillOpacity: 1 }).addTo(grupo);
    }
    if (enquadrar && todos.length) map.fitBounds(L.latLngBounds(todos), { padding: [24, 24], maxZoom: 16 });
  }

  useEffect(() => {
    let alive = true;
    void (async () => {
      const L = await import('leaflet');
      if (!alive || !el.current) return;
      LRef.current = L;
      const map = L.map(el.current, { zoomControl: true, preferCanvas: true }).setView([-15.8, -47.9], 4);
      map.attributionControl.setPrefix(false);
      L.tileLayer(TILES_URL, tilesOptions(19)).addTo(map);
      grupoRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      setTimeout(() => map.invalidateSize(), 80);
      desenhar(true);
    })();
    return () => {
      alive = false;
      mapRef.current?.remove();
      mapRef.current = null;
      grupoRef.current = null;
    };
  }, []);

  useEffect(() => desenhar(false), [itens, destaque]);

  return (
    <div
      ref={el}
      role="img"
      aria-label={`Mapa com ${itens.length} rotas, uma cor por rota. Os nomes e as paradas estão nos cartões.`}
      className="h-[55vh] min-h-[20rem] w-full overflow-hidden rounded-md border border-border lg:h-[32rem]"
    />
  );
}
