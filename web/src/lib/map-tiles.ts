/**
 * Mapa base dos mapas Leaflet (praça e dia do consultor).
 *
 * OpenStreetMap, sem chave. A CARTO (`basemaps.cartocdn.com`), usada antes,
 * passou a exigir chave em out/2026 e devolvia um bloco "API KEY REQUIRED" em
 * todo pedaço do mapa. A política de uso do OSM pede o crédito visível — por
 * isso o controle de atribuição fica ligado.
 *
 * O OSM só tem o mapa claro, e o app agora também (tema único da Lovable): sem
 * filtro escuro nos pedaços do mapa (o parâmetro `dark` saiu na E8).
 */
export const TILES_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const TILES_ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

/** Opções da `L.tileLayer`. */
export function tilesOptions(maxZoom: number) {
  return { maxZoom, attribution: TILES_ATTRIBUTION };
}
