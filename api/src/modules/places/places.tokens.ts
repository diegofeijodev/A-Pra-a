/** Mapa `fonte → provedor` injetável: o teste troca por fakes e nunca toca a rede. */
export const PLACES_PROVIDERS = Symbol('PLACES_PROVIDERS');
/** Tetos do Apify, lidos do ambiente uma vez. */
export const PLACES_LIMITS = Symbol('PLACES_LIMITS');

export interface PlacesLimits {
  apifyMaxPerRun: number;
  apifyMonthlyCap: number;
}
