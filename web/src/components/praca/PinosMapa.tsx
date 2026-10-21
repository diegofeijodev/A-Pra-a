'use client';

import { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';
import { TILES_URL, tilesOptions } from '@/lib/map-tiles';
import type { PinosPagina } from '@/modules/pinos/domain/pinos';

interface Props {
  pins: PinosPagina['pins'];
  cores: Record<string, string>;
  dark: boolean;
  /** Muda quando o filtro muda: a próxima carga reenquadra o mapa nos pinos. */
  chaveEnquadre: string;
  onPino: (leadId: string) => void;
  /** Texto do balão do pino selecionado (linhas; vira `textContent`, nunca HTML). */
  balao: { leadId: string; linhas: string[] } | null;
}

/**
 * Pinos por situação (contrato §34, Lovable `mapa.tsx`): `circleMarker` no renderer de canvas (10 mil SVGs travariam),
 * mapa aberto (OSM) com `.tiles-escuros` no tema escuro, como os outros mapas. Entra por `next/dynamic({ ssr: false })`.
 */
export default function PinosMapa({ pins, cores, dark, chaveEnquadre, onPino, balao }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import('leaflet').Map | null>(null);
  const LRef = useRef<typeof import('leaflet') | null>(null);
  const grupoRef = useRef<import('leaflet').LayerGroup | null>(null);
  const marcadores = useRef(new Map<string, import('leaflet').CircleMarker>());
  const enquadrarRef = useRef(true);
  const onPinoRef = useRef(onPino);
  onPinoRef.current = onPino;
  const dadosRef = useRef({ pins, cores });
  dadosRef.current = { pins, cores };

  useEffect(() => {
    enquadrarRef.current = true;
  }, [chaveEnquadre]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const L = await import('leaflet');
      if (!alive || !el.current) return;
      LRef.current = L;
      const map = L.map(el.current, { zoomControl: true, preferCanvas: true, renderer: L.canvas({ padding: 0.3 }) }).setView([-15.8, -47.9], 4);
      map.attributionControl.setPrefix(false);
      L.tileLayer(TILES_URL, tilesOptions(dark, 19)).addTo(map);
      grupoRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      setTimeout(() => map.invalidateSize(), 80);
      desenhar();
    })();
    return () => {
      alive = false;
      mapRef.current?.remove();
      mapRef.current = null;
      grupoRef.current = null;
      marcadores.current.clear();
    };
  }, [dark]);

  function desenhar() {
    const L = LRef.current;
    const map = mapRef.current;
    const grupo = grupoRef.current;
    if (!L || !map || !grupo) return;
    const d = dadosRef.current;
    grupo.clearLayers();
    marcadores.current.clear();
    for (const [id, lat, lng, code] of d.pins) {
      const m = L.circleMarker([lat, lng], { radius: 7, weight: 2, color: '#ffffff', fillColor: d.cores[code] ?? '#64748b', fillOpacity: 0.95 });
      m.on('click', () => onPinoRef.current(id));
      m.addTo(grupo);
      marcadores.current.set(id, m);
    }
    if (enquadrarRef.current && d.pins.length > 0) {
      enquadrarRef.current = false;
      map.fitBounds(L.latLngBounds(d.pins.map((p) => [p[1], p[2]] as [number, number])), { padding: [24, 24], maxZoom: 16 });
    }
  }

  useEffect(desenhar, [pins, cores, dark]);

  useEffect(() => {
    const m = balao ? marcadores.current.get(balao.leadId) : undefined;
    if (!m || !balao) return;
    const caixa = document.createElement('div');
    for (const [i, linha] of balao.linhas.entries()) {
      const p = document.createElement(i === 0 ? 'strong' : 'p');
      p.textContent = linha;
      caixa.appendChild(p);
    }
    m.bindPopup(caixa).openPopup();
  }, [balao]);

  return (
    <div
      ref={el}
      role="img"
      aria-label="Mapa dos estabelecimentos por situação. As mesmas contagens estão na legenda."
      className="h-[55vh] min-h-[20rem] w-full overflow-hidden rounded-md border border-border lg:h-[38.75rem]"
    />
  );
}
