'use client';

import { useSearchParams } from 'next/navigation';

/**
 * As telas do consultor são VISÕES da rota única `/campo`, não rotas: navegação
 * do App Router busca o payload no servidor e falha sem sinal (spec §9). Trocar
 * de visão é só `history.pushState` — o Next 15 sincroniza `useSearchParams`.
 */
export type Tela =
  | { v: 'hoje' }
  /** `parada`: id da parada do roteiro que já vem escolhida ("Cheguei: fazer check-in"). */
  | { v: 'nova'; parada?: string }
  | { v: 'visita'; ref: string }
  | { v: 'qr' }
  /** Cadastro assistido da empresa da visita `ref` (contrato §26). */
  | { v: 'cadastro'; ref: string }
  | { v: 'roteiro' }
  | { v: 'parada'; id: string }
  /** "Resultado do seu dia" (contrato §33.5); sem `dia` = hoje. */
  | { v: 'resumo'; dia?: string }
  /** Pedir o cupom da 1ª contratação da visita `ref` (lote C, contrato §38.3). */
  | { v: 'pedir-cupom'; ref: string }
  /** "Próximos dias": as rotas publicadas para ele (lote D, contrato §39.7); precisa de sinal. */
  | { v: 'proximos' };

export function telaDaUrl(params: URLSearchParams): Tela {
  const v = params.get('v');
  if (v === 'nova') {
    const parada = params.get('parada');
    return parada ? { v: 'nova', parada } : { v: 'nova' };
  }
  if (v === 'qr') return { v: 'qr' };
  if (v === 'cadastro') {
    const ref = params.get('ref');
    if (ref) return { v: 'cadastro', ref };
  }
  if (v === 'roteiro') return { v: 'roteiro' };
  if (v === 'proximos') return { v: 'proximos' };
  if (v === 'pedir-cupom') {
    const ref = params.get('ref');
    if (ref) return { v: 'pedir-cupom', ref };
  }
  if (v === 'resumo') {
    const dia = params.get('dia');
    return dia && /^\d{4}-\d{2}-\d{2}$/.test(dia) ? { v: 'resumo', dia } : { v: 'resumo' };
  }
  if (v === 'parada') {
    const id = params.get('id');
    if (id) return { v: 'parada', id };
  }
  if (v === 'visita') {
    const ref = params.get('ref');
    if (ref) return { v: 'visita', ref };
  }
  return { v: 'hoje' };
}

export function urlDaTela(t: Tela): string {
  switch (t.v) {
    case 'nova':
      return t.parada ? `/campo?v=nova&parada=${encodeURIComponent(t.parada)}` : '/campo?v=nova';
    case 'roteiro':
      return '/campo?v=roteiro';
    case 'proximos':
      return '/campo?v=proximos';
    case 'resumo':
      return t.dia ? `/campo?v=resumo&dia=${encodeURIComponent(t.dia)}` : '/campo?v=resumo';
    case 'parada':
      return `/campo?v=parada&id=${encodeURIComponent(t.id)}`;
    case 'qr':
      return '/campo?v=qr';
    case 'cadastro':
      return `/campo?v=cadastro&ref=${encodeURIComponent(t.ref)}`;
    case 'pedir-cupom':
      return `/campo?v=pedir-cupom&ref=${encodeURIComponent(t.ref)}`;
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
