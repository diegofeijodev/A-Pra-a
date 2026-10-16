'use client';

import { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';
import { TILES_URL, tilesOptions } from '@/lib/map-tiles';

/**
 * Área de atuação do representante (§21.1): toque no mapa marca o centro; o
 * círculo mostra o raio. Entra por `next/dynamic({ ssr: false })`.
 */
export default function AreaMapa({
  lat,
  lng,
  raioKm,
  inicio,
  dark,
  onCentro,
}: {
  lat: number | null;
  lng: number | null;
  raioKm: number | null;
  inicio: { lat: number; lng: number } | null;
  dark: boolean;
  onCentro: (lat: number, lng: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapa = useRef<import('leaflet').Map | null>(null);
  const circulo = useRef<import('leaflet').Circle | null>(null);
  const onCentroRef = useRef(onCentro);
  onCentroRef.current = onCentro;

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const L = await import('leaflet');
      if (!vivo || !ref.current) return;
      const centro = lat != null && lng != null ? { lat, lng } : inicio ?? { lat: -15.78, lng: -47.93 };
      const map = L.map(ref.current, { zoomControl: true }).setView([centro.lat, centro.lng], lat != null ? 13 : 12);
      map.attributionControl.setPrefix(false);
      L.tileLayer(TILES_URL, tilesOptions(dark, 19)).addTo(map);
      map.on('click', (e) => onCentroRef.current(Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6))));
      mapa.current = map;
    })();
    return () => {
      vivo = false;
      mapa.current?.remove();
      mapa.current = null;
      circulo.current = null;
    };
    // O mapa nasce uma vez; centro e raio mudam pelo efeito de baixo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dark]);

  useEffect(() => {
    void (async () => {
      const L = await import('leaflet');
      const map = mapa.current;
      if (!map) return;
      circulo.current?.remove();
      circulo.current = null;
      if (lat == null || lng == null) return;
      circulo.current = L.circle([lat, lng], {
        radius: (raioKm ?? 0.3) * 1000,
        color: '#ECA826',
        weight: 2,
        fillOpacity: 0.12,
      }).addTo(map);
      map.fitBounds(circulo.current.getBounds(), { padding: [16, 16], maxZoom: 16 });
    })();
  }, [lat, lng, raioKm]);

  return <div ref={ref} data-testid="area-mapa" className="h-56 w-full overflow-hidden rounded-md border border-border" />;
}
