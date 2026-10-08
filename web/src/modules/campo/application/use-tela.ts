'use client';

import { useSearchParams } from 'next/navigation';

/**
 * As telas do consultor são VISÕES da rota única `/campo`, não rotas: navegação
 * do App Router busca o payload no servidor e falha sem sinal (spec §9). Trocar
 * de visão é só `history.pushState` — o Next 15 sincroniza `useSearchParams`.
 */
export type Tela = { v: 'hoje' } | { v: 'nova' } | { v: 'visita'; ref: string } | { v: 'qr' };

export function telaDaUrl(params: URLSearchParams): Tela {
  const v = params.get('v');
  if (v === 'nova') return { v: 'nova' };
  if (v === 'qr') return { v: 'qr' };
  if (v === 'visita') {
    const ref = params.get('ref');
    if (ref) return { v: 'visita', ref };
  }
  return { v: 'hoje' };
}

export function urlDaTela(t: Tela): string {
  switch (t.v) {
    case 'nova':
      return '/campo?v=nova';
    case 'qr':
      return '/campo?v=qr';
    case 'visita':
      return `/campo?v=visita&ref=${encodeURIComponent(t.ref)}`;
    default:
      return '/campo';
  }
}

export function irPara(t: Tela, modo: 'push' | 'replace' = 'push'): void {
  if (modo === 'replace') window.history.replaceState(null, '', urlDaTela(t));
  else window.history.pushState(null, '', urlDaTela(t));
}

export function useTela(): Tela {
  const params = useSearchParams();
  return telaDaUrl(new URLSearchParams(params.toString()));
}
