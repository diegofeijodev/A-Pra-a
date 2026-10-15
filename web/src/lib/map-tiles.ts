/**
 * Mapa base dos mapas Leaflet (praça e dia do consultor).
 *
 * OpenStreetMap, sem chave. A CARTO (`basemaps.cartocdn.com`), usada antes,
 * passou a exigir chave em out/2026 e devolvia um bloco "API KEY REQUIRED" em
 * todo pedaço do mapa. A política de uso do OSM pede o crédito visível — por
 * isso o controle de atribuição fica ligado.
 *
 * O OSM só tem o mapa claro: no tema escuro a camada recebe a classe
 * `TILES_ESCUROS_CLASS`, que inverte as cores por CSS (`globals.css`).
 */
export const TILES_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const TILES_ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
export const TILES_ESCUROS_CLASS = 'tiles-escuros';

/** Opções da `L.tileLayer` para o tema atual. */
export function tilesOptions(dark: boolean, maxZoom: number) {
  return {
    maxZoom,
    attribution: TILES_ATTRIBUTION,
    ...(dark ? { className: TILES_ESCUROS_CLASS } : {}),
  };
}
