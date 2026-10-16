// Geocodificação dos estabelecimentos (bloco B, contrato §21.2). Regras puras.

export type GeoStatus = 'pendente' | 'ok' | 'falhou';

/**
 * Estado inicial de um lead novo: com lat/lng já está localizado; com
 * endereço vai para a fila; sem nenhum dos dois não há o que procurar.
 */
export function geoInicial(lead: { address: string | null | undefined; lat: number | null; lng: number | null }): GeoStatus | null {
  if (lead.lat != null && lead.lng != null) return 'ok';
  return lead.address?.trim() ? 'pendente' : null;
}

/** Texto da consulta ao geocodificador: `endereço, bairro, cidade, Brasil` (vazios saem). */
export function consultaGeo(lead: { address: string; bairro: string | null; city: string }): string {
  return [lead.address, lead.bairro, lead.city, 'Brasil']
    .map((p) => (p ?? '').trim())
    .filter(Boolean)
    .join(', ');
}
