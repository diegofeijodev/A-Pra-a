'use client';

import { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';
import { TILES_URL, tilesOptions } from '@/lib/map-tiles';
import { bboxDaJanela, cantosDaCelula, corDoCalor, intensidade, textoDaQuadra, type Camada, type CelulaCalor } from '@/modules/calor/domain/calor';

export interface VistaMapa {
  bbox: string | null;
  zoom: number;
}

interface Props {
  camada: Camada;
  cells: CelulaCalor[];
  cell: { dlat: number; dlng: number };
  max: number;
  /** Onde o mapa abre (praça/áreas). */
  inicio: { center: [number, number]; zoom: number };
  /** Muda quando o filtro muda: a próxima carga reenquadra o mapa nas quadras. */
  chaveEnquadre: string;
  onVista: (v: VistaMapa) => void;
}

/** Acima disso o tooltip por quadra pesa: os números ficam na lista e no resumo. */
const MAX_TOOLTIPS = 800;

/**
 * Mapa de calor em grade: um retângulo por quadra, no renderer de canvas (5.000 SVGs travariam).
 * Sem plugin de calor — o servidor já agrega, então nenhum ponto de GPS chega ao navegador.
 * Entra por `next/dynamic({ ssr: false })`.
 */
export default function CalorMapa({ camada, cells, cell, max, inicio, chaveEnquadre, onVista }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import('leaflet').Map | null>(null);
  const LRef = useRef<typeof import('leaflet') | null>(null);
  const grupoRef = useRef<import('leaflet').LayerGroup | null>(null);
  const enquadrarRef = useRef(true);
  const onVistaRef = useRef(onVista);
  onVistaRef.current = onVista;
  const inicioRef = useRef(inicio);
  const dadosRef = useRef({ camada, cells, cell, max });
  dadosRef.current = { camada, cells, cell, max };

  useEffect(() => {
    enquadrarRef.current = true;
  }, [chaveEnquadre]);

  // O mapa nasce uma vez; as quadras mudam a cada filtro/arrasto.
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    void (async () => {
      const L = await import('leaflet');
      if (!alive || !el.current) return;
      LRef.current = L;
      const map = L.map(el.current, { zoomControl: true, preferCanvas: true, renderer: L.canvas({ padding: 0.3 }) }).setView(
        inicioRef.current.center,
        inicioRef.current.zoom,
      );
      map.attributionControl.setPrefix(false);
      L.tileLayer(TILES_URL, tilesOptions(19)).addTo(map);
      grupoRef.current = L.layerGroup().addTo(map);
      map.on('moveend', () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          const b = map.getBounds();
          onVistaRef.current({ bbox: bboxDaJanela({ south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() }), zoom: map.getZoom() });
        }, 500);
      });
      mapRef.current = map;
      setTimeout(() => map.invalidateSize(), 80);
      desenhar();
    })();
    return () => {
      alive = false;
      clearTimeout(timer);
      mapRef.current?.remove();
      mapRef.current = null;
      grupoRef.current = null;
    };
  }, []);

  function desenhar() {
    const L = LRef.current;
    const map = mapRef.current;
    const grupo = grupoRef.current;
    if (!L || !map || !grupo) return;
    const d = dadosRef.current;
    grupo.clearLayers();
    const comTooltip = d.cells.length <= MAX_TOOLTIPS;
    for (const c of d.cells) {
      const { cor, opacidade } = corDoCalor(intensidade(c.n, d.max), false);
      const r = L.rectangle(cantosDaCelula(c, d.cell), { stroke: false, fillColor: cor, fillOpacity: opacidade, interactive: comTooltip });
      if (comTooltip) {
        // Só números; elemento com textContent, nunca HTML (Leaflet usa innerHTML em string).
        const t = document.createElement('span');
        t.textContent = textoDaQuadra(d.camada, c);
        r.bindTooltip(t, { sticky: true });
      }
      r.addTo(grupo);
    }
    if (enquadrarRef.current && d.cells.length > 0) {
      enquadrarRef.current = false;
      const pontos = d.cells.flatMap((c) => cantosDaCelula(c, d.cell));
      map.fitBounds(L.latLngBounds(pontos), { padding: [24, 24], maxZoom: 16 });
    }
  }

  useEffect(desenhar, [camada, cells, cell, max]);

  return (
    <div
      ref={el}
      role="img"
      aria-label="Mapa de calor. Os mesmos números estão na lista de quadras abaixo."
      className="h-[26rem] w-full overflow-hidden rounded-md border border-border"
    />
  );
}
