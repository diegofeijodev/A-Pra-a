'use client';

import { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';
import { TILES_URL, tilesOptions } from '@/lib/map-tiles';
import type { StopView } from '@/modules/campo/domain/campo.types';

/** Paradas numeradas na ordem da rota, ligadas por uma linha. Entra por `next/dynamic({ ssr: false })`. */
export default function RotaMapa({ paradas, dark }: { paradas: StopView[]; dark: boolean }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let map: import('leaflet').Map | null = null;
    let vivo = true;
    void (async () => {
      const L = await import('leaflet');
      if (!vivo || !ref.current) return;
      const pts = paradas.filter((s) => s.lat != null && s.lng != null && !s.removed);
      map = L.map(ref.current, { zoomControl: true });
      map.attributionControl.setPrefix(false);
      L.tileLayer(TILES_URL, tilesOptions(dark, 19)).addTo(map);
      if (!pts.length) {
        map.setView([-15.78, -47.93], 4);
        return;
      }
      const linha = pts.map((s) => [s.lat!, s.lng!] as [number, number]);
      L.polyline(linha, { color: '#ECA826', weight: 2, opacity: 0.7, dashArray: '4 6' }).addTo(map);
      for (const s of pts) {
        const el = document.createElement('span');
        el.textContent = `${s.position}. ${s.lead_name}`;
        L.marker([s.lat!, s.lng!], {
          icon: L.divIcon({
            className: '',
            html: `<span style="display:flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:999px;font:700 11px sans-serif;color:#111;background:${s.visit ? '#3E8E5A' : '#ECA826'};border:2px solid #fff">${s.position}</span>`,
            iconSize: [22, 22],
            iconAnchor: [11, 11],
          }),
        })
          .bindTooltip(el)
          .addTo(map);
      }
      map.fitBounds(L.latLngBounds(linha).pad(0.1), { maxZoom: 17 });
      setTimeout(() => map?.invalidateSize(), 80);
    })();
    return () => {
      vivo = false;
      map?.remove();
    };
  }, [paradas, dark]);

  return <div ref={ref} data-testid="rota-mapa" className="h-72 w-full rounded-md border border-border" />;
}
