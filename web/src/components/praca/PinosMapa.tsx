'use client';

import { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';
import { TILES_URL, tilesOptions } from '@/lib/map-tiles';
import { contornoDaForma, type Forma, type PinosPagina } from '@/modules/pinos/domain/pinos';

interface Props {
  pins: PinosPagina['pins'];
  cores: Record<string, string>;
  /** Forma de cada situação (a da legenda): o pino tem o mesmo símbolo que a legenda promete. Ausente = círculo. */
  formas?: Record<string, Forma>;
  /** Muda quando o filtro muda: a próxima carga reenquadra o mapa nos pinos. */
  chaveEnquadre: string;
  onPino: (leadId: string) => void;
  /** Texto do balão do pino selecionado (linhas; vira `textContent`, nunca HTML). */
  balao: { leadId: string; linhas: string[] } | null;
}

/**
 * `circleMarker` que desenha a FORMA da situação (quadrado, losango, triângulo, hexágono, ✕, traço) no canvas, no lugar da
 * bolinha: a legenda mostra símbolo e cor, e o pino tem de bater (cor nunca sozinha, UX §3.0). O toque continua pelo círculo do
 * raio (a área de clique do Leaflet). Sem o canvas (renderer SVG), volta à bolinha.
 */
type PinoComForma = new (latlng: [number, number], opcoes: import('leaflet').CircleMarkerOptions & { forma?: Forma }) => import('leaflet').CircleMarker;
function classeDoPino(L: typeof import('leaflet')): PinoComForma {
  return L.CircleMarker.extend({
    _updatePath(this: {
      _renderer: { _ctx?: CanvasRenderingContext2D; _drawing?: boolean; _updateCircle(l: unknown): void; _fillStroke(c: CanvasRenderingContext2D, l: unknown): void };
      _point: { x: number; y: number };
      _radius: number;
      _empty(): boolean;
      options: { forma?: Forma };
    }) {
      const r = this._renderer;
      const contorno = this.options.forma ? contornoDaForma(this.options.forma, this._radius) : null;
      if (!contorno || !r._ctx) return r._updateCircle(this);
      if (!r._drawing || this._empty()) return;
      const ctx = r._ctx;
      ctx.beginPath();
      contorno.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(this._point.x + x, this._point.y + y) : ctx.lineTo(this._point.x + x, this._point.y + y)));
      ctx.closePath();
      r._fillStroke(ctx, this);
    },
  }) as unknown as PinoComForma;
}

/**
 * Pinos por situação (contrato §34, Lovable `mapa.tsx`): marcadores no renderer de canvas (10 mil SVGs travariam), com a forma da
 * legenda (`classeDoPino`), mapa aberto (OSM), como os outros mapas. Entra por `next/dynamic({ ssr: false })`.
 */
export default function PinosMapa({ pins, cores, formas, chaveEnquadre, onPino, balao }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import('leaflet').Map | null>(null);
  const LRef = useRef<typeof import('leaflet') | null>(null);
  const PinoRef = useRef<PinoComForma | null>(null);
  const grupoRef = useRef<import('leaflet').LayerGroup | null>(null);
  const marcadores = useRef(new Map<string, import('leaflet').CircleMarker>());
  const enquadrarRef = useRef(true);
  const onPinoRef = useRef(onPino);
  onPinoRef.current = onPino;
  const dadosRef = useRef({ pins, cores, formas });
  dadosRef.current = { pins, cores, formas };

  useEffect(() => {
    enquadrarRef.current = true;
  }, [chaveEnquadre]);

  useEffect(() => {
    let alive = true;
    const marcados = marcadores.current;
    void (async () => {
      const L = await import('leaflet');
      if (!alive || !el.current) return;
      LRef.current = L;
      PinoRef.current = classeDoPino(L);
      const map = L.map(el.current, { zoomControl: true, preferCanvas: true, renderer: L.canvas({ padding: 0.3 }) }).setView([-15.8, -47.9], 4);
      map.attributionControl.setPrefix(false);
      L.tileLayer(TILES_URL, tilesOptions(19)).addTo(map);
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
      marcados.clear();
    };
  }, []);

  function desenhar() {
    const L = LRef.current;
    const Pino = PinoRef.current;
    const map = mapRef.current;
    const grupo = grupoRef.current;
    if (!L || !Pino || !map || !grupo) return;
    const d = dadosRef.current;
    grupo.clearLayers();
    marcadores.current.clear();
    for (const [id, lat, lng, code] of d.pins) {
      const m = new Pino([lat, lng], { radius: 7, weight: 2, color: '#ffffff', fillColor: d.cores[code] ?? '#64748b', fillOpacity: 0.95, forma: d.formas?.[code] });
      m.on('click', () => onPinoRef.current(id));
      m.addTo(grupo);
      marcadores.current.set(id, m);
    }
    if (enquadrarRef.current && d.pins.length > 0) {
      enquadrarRef.current = false;
      map.fitBounds(L.latLngBounds(d.pins.map((p) => [p[1], p[2]] as [number, number])), { padding: [24, 24], maxZoom: 16 });
    }
  }

  useEffect(desenhar, [pins, cores, formas]);

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
      // `isolate`: os painéis do Leaflet (z-index 400–1000) ficam DENTRO do mapa, sem passar por cima da faixa e das abas fixas
      // da casca do representante (redesenho E4) nem do menu da equipe.
      className="isolate h-[55vh] min-h-[20rem] w-full overflow-hidden rounded-md border border-border lg:h-[38.75rem]"
    />
  );
}
