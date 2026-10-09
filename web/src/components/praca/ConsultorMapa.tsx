'use client';

import { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';
import type { PointView, VisitView } from '@/modules/campo/domain/campo.types';

const TILES = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const TILES_LIGHT = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

/** Mapa do dia (spec §8.2): pontos ligados na ordem gravada + check-ins destacados. Entra por `next/dynamic({ ssr: false })`. */
export default function ConsultorMapa({ trilhas, visitas, dark }: { trilhas: PointView[][]; visitas: VisitView[]; dark: boolean }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let map: import('leaflet').Map | null = null;
    let vivo = true;
    void (async () => {
      const L = await import('leaflet');
      if (!vivo || !ref.current) return;
      // Uma linha por jornada (o fim de uma não se liga ao começo da outra), em ordem de hora real.
      const linhas = trilhas.map((t) =>
        [...t].sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).map((p) => [p.lat, p.lng] as [number, number]),
      );
      const checkins = visitas.map((v) => [v.checkin_lat, v.checkin_lng] as [number, number]);
      const todos = [...linhas.flat(), ...checkins];
      if (todos.length === 0) return;
      map = L.map(ref.current, { zoomControl: true, attributionControl: false });
      L.tileLayer(dark ? TILES : TILES_LIGHT, { maxZoom: 19 }).addTo(map);
      for (const l of linhas) if (l.length > 1) L.polyline(l, { color: '#ECA826', weight: 3, opacity: 0.85 }).addTo(map);
      for (const v of visitas) {
        L.circleMarker([v.checkin_lat, v.checkin_lng], {
          radius: 7,
          color: v.far_from_place ? '#B4432E' : '#3E8E5A',
          weight: 2,
          fillOpacity: 0.8,
        })
          .bindTooltip(v.lead_name)
          .addTo(map);
      }
      map.fitBounds(L.latLngBounds(todos), { padding: [24, 24], maxZoom: 17 });
    })();
    return () => {
      vivo = false;
      map?.remove();
    };
  }, [trilhas, visitas, dark]);

  return <div ref={ref} className="h-80 w-full overflow-hidden rounded-md border border-border" />;
}
