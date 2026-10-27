'use client';

import { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';
import { TILES_URL, tilesOptions } from '@/lib/map-tiles';
import type { Visao } from '@/modules/areas/domain/area-form';

// Irmão do `AberturaMapa` (mesmo Leaflet puro, mesmos tiles e o círculo âmbar
// tracejado), mas clicável: o clique marca o centro da área. Entra por
// `next/dynamic({ ssr: false })` porque o Leaflet mexe em `window`.

interface Props {
  visao: Visao;
  /** Áreas já cadastradas, desenhadas esmaecidas para dar referência. */
  existentes: { id: string; name: string; lat: number; lng: number; radius_m: number; active: boolean }[];
  /** Área em edição/criação. `lat/lng` nulos = ainda sem centro. */
  atual: { lat: number | null; lng: number | null; radius_m: number };
  /** Sem `onPick` o mapa é só leitura (quem não é admin). */
  onPick?: (lat: number, lng: number) => void;
}

const COR = '#e8a020';

export default function AreaMapa({ visao, existentes, atual, onPick }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import('leaflet').Map | null>(null);
  const LRef = useRef<typeof import('leaflet') | null>(null);
  const camadaRef = useRef<import('leaflet').LayerGroup | null>(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const visaoInicial = useRef(visao);

  // Cria o mapa UMA vez: raio e centro mudam a cada clique e não podem derrubar
  // o mapa.
  useEffect(() => {
    let alive = true;
    void (async () => {
      const L = await import('leaflet');
      if (!alive || !el.current) return;
      LRef.current = L;
      const map = L.map(el.current, { zoomControl: true }).setView(visaoInicial.current.center, visaoInicial.current.zoom);
      map.attributionControl.setPrefix(false);
      L.tileLayer(TILES_URL, tilesOptions(18)).addTo(map);
      camadaRef.current = L.layerGroup().addTo(map);
      map.on('click', (e: import('leaflet').LeafletMouseEvent) => onPickRef.current?.(e.latlng.lat, e.latlng.lng));
      mapRef.current = map;
      setTimeout(() => map.invalidateSize(), 80);
      desenhar();
    })();
    return () => {
      alive = false;
      mapRef.current?.remove();
      mapRef.current = null;
      camadaRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function desenhar() {
    const L = LRef.current;
    const grupo = camadaRef.current;
    if (!L || !grupo) return;
    grupo.clearLayers();
    for (const a of existentes) {
      L.circle([a.lat, a.lng], {
        radius: a.radius_m,
        color: '#3a3a34',
        weight: 1,
        dashArray: a.active ? undefined : '4 4',
        fillOpacity: a.active ? 0.08 : 0.02,
      })
        .bindTooltip(a.active ? a.name : `${a.name} (desativada)`, { direction: 'top' })
        .addTo(grupo);
    }
    if (atual.lat != null && atual.lng != null) {
      L.circle([atual.lat, atual.lng], {
        radius: atual.radius_m,
        color: COR,
        weight: 1.5,
        dashArray: '6 6',
        fillColor: COR,
        fillOpacity: 0.12,
      }).addTo(grupo);
      L.circleMarker([atual.lat, atual.lng], { radius: 7, color: COR, weight: 2.5, fillColor: COR, fillOpacity: 0.9 }).addTo(grupo);
    }
  }

  // Só as camadas mudam; o mapa fica.
  useEffect(desenhar);

  // Edição de outra área: leva a vista até o centro dela.
  const { lat, lng } = atual;
  useEffect(() => {
    if (lat != null && lng != null && mapRef.current && !mapRef.current.getBounds().contains([lat, lng])) {
      mapRef.current.setView([lat, lng], Math.max(mapRef.current.getZoom(), 13));
    }
  }, [lat, lng]);

  return (
    <div
      ref={el}
      role="application"
      aria-label="Mapa para marcar o centro da área de atuação"
      className="h-72 w-full rounded-md border border-border sm:h-96"
    />
  );
}
