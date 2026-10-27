'use client';

import { useSearchParams } from 'next/navigation';
import type { AbaRepresentante } from '@/modules/acesso/domain/enderecos';

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
  | { v: 'proximos' }
  // Abas da casca do representante (redesenho E4, arquitetura §3.6): mesma rota, só a visão muda — funcionam sem sinal.
  /** Mapa dos clientes dele (contrato §34.4); precisa de sinal. */
  | { v: 'mapa' }
  /** Retornos, vouchers e a lista dos visitados (contrato §34.7). */
  | { v: 'clientes' }
  /** "Em construção" + atalho para o resultado do dia (decisão D5). */
  | { v: 'desempenho' }
  /** Ganhos, Pix e cadastros confirmados (saíram da Hoje). */
  | { v: 'carteira' };

/** As visões sem parâmetro além do `v` (as abas novas e as que já existiam). */
const SO_V = ['qr', 'roteiro', 'proximos', 'mapa', 'clientes', 'desempenho', 'carteira'] as const;
type SoV = (typeof SO_V)[number];
const ehSoV = (v: string | null): v is SoV => (SO_V as readonly (string | null)[]).includes(v);

export function telaDaUrl(params: URLSearchParams): Tela {
  const v = params.get('v');
  if (v === 'nova') {
    const parada = params.get('parada');
    return parada ? { v: 'nova', parada } : { v: 'nova' };
  }
  if (ehSoV(v)) return { v };
  if (v === 'cadastro') {
    const ref = params.get('ref');
    if (ref) return { v: 'cadastro', ref };
  }
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
    case 'qr':
    case 'roteiro':
    case 'proximos':
    case 'mapa':
    case 'clientes':
    case 'desempenho':
    case 'carteira':
      return `/campo?v=${t.v}`;
    case 'resumo':
      return t.dia ? `/campo?v=resumo&dia=${encodeURIComponent(t.dia)}` : '/campo?v=resumo';
    case 'parada':
      return `/campo?v=parada&id=${encodeURIComponent(t.id)}`;
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

/**
 * Qual das 5 abas acende em cada visão (arquitetura §3.6). `null` esconde a barra nas telas de fluxo, que têm o próprio botão
 * fixo embaixo (a visita, a chegada, o cadastro, o pedido do voucher e a parada). Roteiro, resultado do dia, próximos dias e
 * QR saem da Hoje e acendem "Hoje".
 */
export function abaDaTela(t: Tela): AbaRepresentante | null {
  switch (t.v) {
    case 'mapa':
    case 'clientes':
    case 'desempenho':
    case 'carteira':
      return t.v;
    case 'nova':
    case 'visita':
    case 'cadastro':
    case 'pedir-cupom':
    case 'parada':
      return null;
    default:
      return 'hoje';
  }
}

/** As 5 abas da Lovable (`repNav`), na ordem dela; cada uma abre a sua visão por `irPara` (nunca `Link`: funciona sem sinal). */
export const ABAS_REPRESENTANTE: readonly { aba: AbaRepresentante; rotulo: string; tela: Tela }[] = [
  { aba: 'hoje', rotulo: 'Hoje', tela: { v: 'hoje' } },
  { aba: 'mapa', rotulo: 'Mapa', tela: { v: 'mapa' } },
  { aba: 'clientes', rotulo: 'Clientes', tela: { v: 'clientes' } },
  { aba: 'desempenho', rotulo: 'Desempenho', tela: { v: 'desempenho' } },
  { aba: 'carteira', rotulo: 'Carteira', tela: { v: 'carteira' } },
];

export function irPara(t: Tela, modo: 'push' | 'replace' = 'push'): void {
  if (modo === 'replace') window.history.replaceState(null, '', urlDaTela(t));
  else window.history.pushState(null, '', urlDaTela(t));
}

export function useTela(): Tela {
  const params = useSearchParams();
  return telaDaUrl(new URLSearchParams(params.toString()));
}
