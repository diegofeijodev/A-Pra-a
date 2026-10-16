'use client';

import { useSearchParams } from 'next/navigation';

/**
 * As telas do consultor são VISÕES da rota única `/campo`, não rotas: navegação
 * do App Router busca o payload no servidor e falha sem sinal (spec §9). Trocar
 * de visão é só `history.pushState` — o Next 15 sincroniza `useSearchParams`.
 */
export type Tela =
  | { v: 'hoje' }
  | { v: 'nova'; lead?: string; nome?: string }
  | { v: 'visita'; ref: string }
  | { v: 'qr' }
  | { v: 'rota' }
  | { v: 'numeros' };

export function telaDaUrl(params: URLSearchParams): Tela {
  const v = params.get('v');
  if (v === 'nova') {
    // Vindo da rota: o estabelecimento já escolhido (§21.5).
    const lead = params.get('lead');
    const nome = params.get('nome');
    return lead && nome ? { v: 'nova', lead, nome } : { v: 'nova' };
  }
  if (v === 'qr') return { v: 'qr' };
  if (v === 'rota') return { v: 'rota' };
  if (v === 'numeros') return { v: 'numeros' };
  if (v === 'visita') {
    const ref = params.get('ref');
    if (ref) return { v: 'visita', ref };
  }
  return { v: 'hoje' };
}

export function urlDaTela(t: Tela): string {
  switch (t.v) {
    case 'nova':
      return t.lead && t.nome
        ? `/campo?v=nova&lead=${encodeURIComponent(t.lead)}&nome=${encodeURIComponent(t.nome)}`
        : '/campo?v=nova';
    case 'qr':
      return '/campo?v=qr';
    case 'rota':
      return '/campo?v=rota';
    case 'numeros':
      return '/campo?v=numeros';
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
