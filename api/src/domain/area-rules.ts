/**
 * Regras puras das áreas de atuação do campo (spec 2026-10-19, §4.1).
 *
 * Sem Prisma nem HTTP. A pertinência reaproveita o haversine do bloco A
 * (`distanciaM`), que arredonda em metros: o raio é inteiro, então a borda é
 * comparada na mesma escala.
 */
import { distanciaM, type Coordenada } from './campo-rules';
import { norm } from './dedup';

export const RAIO_AREA_MIN_M = 200;
export const RAIO_AREA_MAX_M = 5000;

/** Retângulo envolvente do Brasil (inclui ilhas oceânicas principais com folga). */
export const BRASIL = { latMin: -33.75, latMax: 5.3, lngMin: -74, lngMax: -28.8 } as const;

export interface AreaGeometria extends Coordenada {
  radius_m: number;
}

export function dentroDoBrasil(p: Coordenada): boolean {
  return (
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng) &&
    p.lat >= BRASIL.latMin &&
    p.lat <= BRASIL.latMax &&
    p.lng >= BRASIL.lngMin &&
    p.lng <= BRASIL.lngMax
  );
}

export function raioValido(r: number): boolean {
  return Number.isInteger(r) && r >= RAIO_AREA_MIN_M && r <= RAIO_AREA_MAX_M;
}

/** `null` = válida; senão a mensagem para a pessoa. */
export function validarArea(a: AreaGeometria): string | null {
  if (!dentroDoBrasil(a)) return 'lat/lng: o centro da área precisa estar dentro do Brasil.';
  if (!raioValido(a.radius_m)) {
    return `radius_m: use um raio inteiro entre ${RAIO_AREA_MIN_M} e ${RAIO_AREA_MAX_M} metros.`;
  }
  return null;
}

/** Ponto dentro da área: distância ao centro ≤ raio. */
export function pontoNaArea(p: Coordenada, area: AreaGeometria): boolean {
  return distanciaM(p, area) <= area.radius_m;
}

/** Chave de comparação do nome (único por praça, sem acento/caixa/pontuação). */
export function chaveNomeArea(nome: string): string {
  return norm(nome);
}
