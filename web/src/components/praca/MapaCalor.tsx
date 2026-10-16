'use client';

import { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';
import { TILES_URL, tilesOptions } from '@/lib/map-tiles';
import type { MapPoint, StatusNoMapa } from '@/modules/mapa/infrastructure/mapa.api';

export const COR_STATUS: Record<StatusNoMapa, string> = {
  nao_visitado: '#6E6B60',
  visitado: '#3E7EA8',
  cadastrado: '#ECA826',
  com_vaga: '#3E8E5A',
};

/**
 * Mapa de calor dos estabelecimentos da praça (§21.2) + os pontos pintados
 * pela situação. Entra por `next/dynamic({ ssr: false })`.
 */
export default function MapaCalor({
  pontos,
  centro,
  calor,
  marcadores,
  dark,
}: {
  pontos: MapPoint[];
  centro: { lat: number; lng: number } | null;
  calor: boolean;
  marcadores: boolean;
  dark: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let map: import('leaflet').Map | null = null;
    let vivo = true;
    void (async () => {
      const mod = await import('leaflet');
      const L = (mod as unknown as { default?: typeof mod }).default ?? mod;
      // O plugin procura o `L` global e pendura `heatLayer` nele.
      (window as unknown as { L: typeof L }).L = L;
      await import('leaflet.heat');
      if (!vivo || !ref.current) return;
      map = L.map(ref.current, { zoomControl: true });
      map.attributionControl.setPrefix(false);
      L.tileLayer(TILES_URL, tilesOptions(dark, 19)).addTo(map);
      if (calor && pontos.length) {
        const heat = (L as unknown as { heatLayer: (p: [number, number, number][], o: object) => import('leaflet').Layer }).heatLayer(
          pontos.map((p) => [p.lat, p.lng, 1]),
          { radius: 22, blur: 18, maxZoom: 15, minOpacity: 0.3 },
        );
        heat.addTo(map);
      }
      if (marcadores) {
        for (const p of pontos) {
          // Nome vem da planilha: texto, nunca HTML (o Leaflet usa innerHTML no tooltip).
          const nome = document.createElement('span');
          nome.textContent = p.name;
          L.circleMarker([p.lat, p.lng], { radius: 4, color: COR_STATUS[p.status], weight: 1, fillOpacity: 0.9 })
            .bindTooltip(nome)
            .addTo(map);
        }
      }
      if (pontos.length) map.fitBounds(L.latLngBounds(pontos.map((p) => [p.lat, p.lng] as [number, number])).pad(0.05), { maxZoom: 16 });
      else map.setView(centro ? [centro.lat, centro.lng] : [-15.78, -47.93], centro ? 12 : 4);
      setTimeout(() => map?.invalidateSize(), 80);
    })();
    return () => {
      vivo = false;
      map?.remove();
    };
  }, [pontos, centro, calor, marcadores, dark]);

  return <div ref={ref} data-testid="mapa-calor" className="h-80 w-full rounded-md border border-border sm:h-[28rem]" />;
}
