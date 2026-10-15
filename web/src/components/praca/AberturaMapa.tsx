'use client';

import { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';
import { fmtPop, RADIUS_KM } from '@/lib/geo';
import { TILES_URL, tilesOptions } from '@/lib/map-tiles';
import type { Municipio, Vizinha } from '@/modules/geo/application/use-geo';

// Fatiado do `AberturaPraca` do protótipo para poder entrar por
// `next/dynamic({ ssr: false })`: o Leaflet mexe em `window` no import e não
// sobrevive à renderização no servidor.

export default function AberturaMapa({
  centro,
  vizinhas,
  dark,
}: {
  centro: Municipio;
  vizinhas: Vizinha[];
  dark: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let map: import("leaflet").Map | null = null;
    let alive = true;
    void (async () => {
      const L = await import("leaflet");
      if (!alive || !ref.current) return;
      map = L.map(ref.current, { zoomControl: true }).setView([centro.lat, centro.lon], 9);
      map.attributionControl.setPrefix(false);
      L.tileLayer(TILES_URL, tilesOptions(dark, 18)).addTo(map);
      L.circle([centro.lat, centro.lon], {
        radius: RADIUS_KM * 1000,
        color: "#e8a020", weight: 1.5, dashArray: "6 6", fillColor: "#e8a020", fillOpacity: 0.06,
      }).addTo(map);
      for (const m of vizinhas) {
        L.circleMarker([m.lat, m.lon], {
          radius: m.pop > 100_000 ? 7 : m.pop > 30_000 ? 5 : 3.5,
          color: dark ? "#d8d8d0" : "#3a3a34", weight: 1,
          fillColor: dark ? "#d8d8d0" : "#3a3a34", fillOpacity: 0.7,
        }).addTo(map).bindTooltip(`${m.nome} · ${fmtPop(m.pop)} hab`, { direction: "top" });
      }
      L.circleMarker([centro.lat, centro.lon], {
        radius: 9, color: "#e8a020", weight: 2.5, fillColor: "#e8a020", fillOpacity: 0.9,
      }).addTo(map).bindTooltip(`<b>${centro.nome}</b> · ${fmtPop(centro.pop)} hab`, { direction: "top" }).openTooltip();
      const pts: [number, number][] = [[centro.lat, centro.lon], ...vizinhas.map((m) => [m.lat, m.lon] as [number, number])];
      map.fitBounds(L.latLngBounds(pts).pad(0.08));
      setTimeout(() => map?.invalidateSize(), 80);
    })();
    return () => { alive = false; map?.remove(); };
  }, [centro, vizinhas, dark]);

  return <div ref={ref} className="h-72 w-full rounded-md border border-border sm:h-96" />;
}
