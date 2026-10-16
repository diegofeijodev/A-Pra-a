'use client';

import { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';
import { TILES_URL, tilesOptions } from '@/lib/map-tiles';
import type { Trilhas } from '@/modules/consultores/infrastructure/consultores.api';

export const CORES_REPRESENTANTE = ['#ECA826', '#3E7EA8', '#3E8E5A', '#B4432E', '#6B5B8A', '#5A9BC4', '#C4881A'];

/** Mapa do admin (§21.9): o trajeto de cada representante no dia e as paradas com o tempo no local. */
export default function TrilhasMapa({ trilhas, dark }: { trilhas: Trilhas; dark: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let map: import('leaflet').Map | null = null;
    let vivo = true;
    void (async () => {
      const L = await import('leaflet');
      if (!vivo || !ref.current) return;
      map = L.map(ref.current, { zoomControl: true });
      map.attributionControl.setPrefix(false);
      L.tileLayer(TILES_URL, tilesOptions(dark, 19)).addTo(map);
      const todos: [number, number][] = [];
      trilhas.consultants.forEach((c, i) => {
        const cor = CORES_REPRESENTANTE[i % CORES_REPRESENTANTE.length]!;
        const linha = c.points.map((p) => [p.lat, p.lng] as [number, number]);
        if (linha.length > 1) L.polyline(linha, { color: cor, weight: 3, opacity: 0.8 }).addTo(map!);
        todos.push(...linha);
        for (const s of c.stops) {
          const el = document.createElement('span');
          el.textContent = `${c.name} · ${s.lead_name} · ${s.minutes_on_site != null ? `${s.minutes_on_site} min` : 'sem checkout'}`;
          L.circleMarker([s.lat, s.lng], { radius: 6, color: cor, weight: 2, fillOpacity: 0.85 }).bindTooltip(el).addTo(map!);
          todos.push([s.lat, s.lng]);
        }
      });
      if (todos.length) map.fitBounds(L.latLngBounds(todos).pad(0.08), { maxZoom: 16 });
      else map.setView([-15.78, -47.93], 4);
      setTimeout(() => map?.invalidateSize(), 80);
    })();
    return () => {
      vivo = false;
      map?.remove();
    };
  }, [trilhas, dark]);
  return <div ref={ref} data-testid="trilhas-mapa" className="h-80 w-full rounded-md border border-border" />;
}
