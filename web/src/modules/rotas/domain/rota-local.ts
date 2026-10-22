/**
 * Lógica pura do roteiro no aparelho (contrato §23.7): links de navegação, próxima parada,
 * ritmo com a conta, reordenação sem sinal e o "por cima" das ações ainda na fila.
 * Sem React, sem rede, sem relógio do sistema (a hora entra por parâmetro).
 *
 * Duplica, de propósito, o haversine e a conta de ritmo da API (`rota-rules.ts`): o servidor é
 * a autoridade e este código só mostra algo coerente enquanto não há sinal.
 */
import type { ItemFila } from '@/modules/campo/domain/campo.types';
import type { ConfigRota, RouteView, StopView } from './rota.schema';

export interface Ponto {
  lat: number;
  lng: number;
}

const RAIO_TERRA_M = 6_371_000;
const rad = (g: number) => (g * Math.PI) / 180;

/** Distância em metros (haversine), arredondada — igual à da API. */
export function distanciaM(a: Ponto, b: Ponto): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * RAIO_TERRA_M * Math.asin(Math.sqrt(h)));
}

const temCoordenada = (p: { lat: number; lng: number }) => Number.isFinite(p.lat) && Number.isFinite(p.lng);

/** Maps a pé. Sem coordenada válida, cai no endereço. Abre pelo link universal: não depende de nada do Praça. */
export function linkMaps(p: { lat: number; lng: number; address?: string; name?: string }): string {
  const destino = temCoordenada(p) ? `${p.lat},${p.lng}` : encodeURIComponent([p.name, p.address].filter(Boolean).join(', '));
  return `https://www.google.com/maps/dir/?api=1&destination=${destino}&travelmode=walking`;
}

/** Waze (`ul?ll=lat,lng&navigate=yes`, https://developers.google.com/waze/deeplinks). */
export function linkWaze(p: { lat: number; lng: number; address?: string; name?: string }): string {
  if (temCoordenada(p)) return `https://waze.com/ul?ll=${p.lat}%2C${p.lng}&navigate=yes`;
  return `https://waze.com/ul?q=${encodeURIComponent([p.name, p.address].filter(Boolean).join(', '))}&navigate=yes`;
}

/** `tel:` só com número plausível (o telefone da parada pode vir vazio). */
export function linkTel(phone: string): string | null {
  const d = phone.replace(/\D/g, '');
  return d.length >= 8 ? `tel:+${d.startsWith('55') ? d : `55${d}`}` : null;
}

export const porSeq = (a: StopView, b: StopView) => a.seq - b.seq || (a.id < b.id ? -1 : 1);

/**
 * Próxima parada: a primeira planejada pendente, na ordem. Acabando as pendentes, volta a que foi
 * "deixada para a tarde" (UX §4.4: "manhã vai à tarde"); "para amanhã" nunca volta hoje.
 */
export function proximaParada(stops: StopView[]): StopView | null {
  const ordem = [...stops].sort(porSeq);
  return (
    ordem.find((s) => s.status === 'pendente' && s.kind === 'planejada') ??
    ordem.find((s) => s.status === 'adiada' && s.deferred_to === 'tarde') ??
    null
  );
}

/** Paradas que ainda faltam hoje: pendentes planejadas e as deixadas para a tarde, na ordem. */
export const faltam = (stops: StopView[]): StopView[] =>
  [...stops]
    .sort(porSeq)
    .filter((s) => (s.status === 'pendente' && s.kind === 'planejada') || (s.status === 'adiada' && s.deferred_to === 'tarde'));

/** "11:40" → "11h40". */
export const etaTexto = (eta: string | null): string => (eta ? eta.replace(':', 'h') : '—');

/**
 * "240 m · 4 min a pé" (a pé = 4,5 km/h por padrão) ou "1,3 km · 4 min de carro" (modo carro, §30.4):
 * a mesma conta da API (`ceil(metros ÷ (km/h × 1000 ÷ 60))`). A distância é a estimada desde a parada anterior.
 */
export function trechoTexto(distanceM: number, kmh: number, modo: 'a_pe' | 'carro' = 'a_pe'): string {
  const min = Math.ceil(distanceM / ((kmh * 1000) / 60));
  const d = distanceM < 1000 ? `${distanceM} m` : `${(distanceM / 1000).toFixed(1).replace('.', ',')} km`;
  return `${d} · ${min} min ${modo === 'carro' ? 'de carro' : 'a pé'}`;
}

/** Velocidade do roteiro: a do modo (carro) ou a de caminhada da configuração. */
export const velocidadeDoRoteiro = (r: { params: { velocidade_kmh: number }; travel?: { speed_kmh: number } }): number =>
  r.travel?.speed_kmh ?? r.params.velocidade_kmh;

// ── horários ────────────────────────────────────────────────

const hhmm = (s: string): number => {
  const [h = 0, m = 0] = s.split(':').map(Number);
  return h * 60 + m;
};

const HORA_SP = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** Minutos desde 00:00 em Brasília. */
export function minutosSp(instante: Date | string | number): number {
  const partes = HORA_SP.formatToParts(new Date(instante));
  const h = Number(partes.find((p) => p.type === 'hour')?.value ?? 0);
  const m = Number(partes.find((p) => p.type === 'minute')?.value ?? 0);
  return h * 60 + m;
}

// ── ritmo ───────────────────────────────────────────────────

/** O que a conta do ritmo precisa da configuração (o `goal` do Hoje traz só isso). */
export type ParamsRitmo = Pick<ConfigRota, 'meta_diaria' | 'janela_inicio' | 'janela_fim' | 'almoco_inicio' | 'almoco_fim'>;

export interface RitmoLocal {
  /** Lote B §37.6: minutos de intervalo REAL descontados (no lugar do almoço); ausente = a conta de hoje. */
  intervaloDescontado?: number;
  meta: number;
  feitas: number;
  esperadas: number;
  /** Positivo = à frente. */
  delta: number;
  faltam: number;
  minutosUteis: number;
  minutosPorVisita: number;
}

/** Mesma conta da API: minutos úteis (janela menos almoço) ÷ (minutos úteis do dia ÷ meta). */
/**
 * `pausas` (lote B §37.6, espelho da API): intervalos REAIS do dia em minutos; com algum, os minutos úteis descontam o real NO LUGAR
 * do almoço configurado (nunca os dois). O ritmo por visita continua o do plano.
 */
export function ritmoLocal(params: ParamsRitmo, feitas: number, agoraMin: number, pausas: readonly { ini: number; fim: number }[] = []): RitmoLocal {
  const ini = hhmm(params.janela_inicio);
  const fim = hhmm(params.janela_fim);
  const aIni = hhmm(params.almoco_inicio);
  const aFim = hhmm(params.almoco_fim);
  const t = Math.min(Math.max(agoraMin, ini), fim);
  const real = pausas.reduce((a, x) => a + Math.max(0, Math.min(x.fim, t) - Math.max(x.ini, ini)), 0);
  const minutosUteis = pausas.length > 0 ? Math.max(0, t - ini - real) : t - ini - Math.max(0, Math.min(t, aFim) - aIni);
  const totalUtil = fim - ini - Math.max(aFim - aIni, 0);
  const porVisita = params.meta_diaria > 0 ? totalUtil / params.meta_diaria : totalUtil;
  const esperadas = Math.min(params.meta_diaria, Math.floor(minutosUteis / porVisita));
  return {
    ...(pausas.length > 0 ? { intervaloDescontado: real } : {}),
    meta: params.meta_diaria,
    feitas,
    esperadas,
    delta: feitas - esperadas,
    faltam: Math.max(params.meta_diaria - feitas, 0),
    minutosUteis,
    minutosPorVisita: Math.round(porVisita * 10) / 10,
  };
}

export interface RitmoTexto {
  /** Sempre com ícone + palavra (nunca só cor). */
  titulo: string;
  ok: boolean;
  /** A conta, sempre à mostra. */
  conta: string;
}

const horaCurta = (min: number) => `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`.replace(/h00$/, 'h');

export function ritmoTexto(r: RitmoLocal, params: Pick<ConfigRota, 'janela_fim'>, agoraMin: number): RitmoTexto {
  const uteis = r.intervaloDescontado !== undefined ? `${r.minutosUteis} min úteis (o intervalo de ${r.intervaloDescontado} min não conta)` : `${r.minutosUteis} min úteis`;
  const conta = `Às ${horaCurta(agoraMin)} o esperado é ${r.esperadas}: ${uteis} ÷ ${String(r.minutosPorVisita).replace('.', ',')} min por visita`;
  if (r.delta > 0) return { titulo: `✓ Ritmo: ${r.delta} à frente`, ok: true, conta };
  if (r.delta === 0) return { titulo: '✓ Ritmo: no ponto', ok: true, conta };
  const fim = horaCurta(hhmm(params.janela_fim));
  return { titulo: `⚠ Ritmo: ${-r.delta} atrás. Faltam ${r.faltam} para chegar a ${r.meta} às ${fim}`, ok: false, conta };
}

// ── reordenação sem sinal ───────────────────────────────────

/** Mais próximo em linha reta a partir de `inicio`; empate pelo menor id. Sem 2-opt, sem relógio. */
export function maisProximoEmLinhaReta(inicio: Ponto, stops: StopView[]): StopView[] {
  const restantes = [...stops].sort((a, b) => (a.id < b.id ? -1 : 1));
  const saida: StopView[] = [];
  let atual: Ponto = inicio;
  while (restantes.length > 0) {
    let melhor = 0;
    let melhorD = distanciaM(atual, restantes[0]!);
    for (let i = 1; i < restantes.length; i += 1) {
      const d = distanciaM(atual, restantes[i]!);
      if (d < melhorD) {
        melhor = i;
        melhorD = d;
      }
    }
    const [p] = restantes.splice(melhor, 1);
    saida.push(p!);
    atual = p!;
  }
  return saida;
}

/**
 * "Refazer rota" sem sinal: reordena as pendentes (fixas ficam no lugar) e devolve o roteiro com
 * os mesmos números de `seq` redistribuídos. Sem horário (o servidor recalcula ao voltar o sinal).
 */
export function reordenarSemSinal(route: RouteView, pos: Ponto): RouteView {
  const pend = [...route.stops].sort(porSeq).filter((s) => s.status === 'pendente');
  const seqs = pend.map((s) => s.seq);
  const saida: StopView[] = [];
  let livres: StopView[] = [];
  let prev: Ponto = pos;
  for (const s of pend) {
    if (s.fixa) {
      saida.push(...maisProximoEmLinhaReta(prev, livres), s);
      prev = s;
      livres = [];
    } else livres.push(s);
  }
  saida.push(...maisProximoEmLinhaReta(prev, livres));
  const novos = new Map(saida.map((s, i) => [s.id, { ...s, seq: seqs[i]!, eta: null, eta_min: null }]));
  return { ...route, stops: route.stops.map((s) => novos.get(s.id) ?? s) };
}

// ── ações ainda na fila, por cima do roteiro guardado ───────

export type AcaoRotaPendente =
  | { kind: 'stop_skip'; stop_id: string; payload: { reason: string; note?: string; at: string } }
  | { kind: 'stop_defer'; stop_id: string; payload: { at: string } }
  | { kind: 'stop_undo'; stop_id: string; payload: { at: string } }
  | { kind: 'route_reoptimize'; payload: { lat: number; lng: number; at: string } }
  /** Check-in na fila de um lead do roteiro: o servidor marcará a parada como visitada. */
  | { kind: 'visita_no_lead'; lead_id: string };

/** Ações de roteiro ainda na fila (na ordem de envio) → o formato do "por cima". */
export function acoesDaFila(itens: ItemFila[]): AcaoRotaPendente[] {
  const saida: AcaoRotaPendente[] = [];
  for (const i of [...itens].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))) {
    if (i.kind === 'stop_skip') saida.push({ kind: 'stop_skip', stop_id: i.stop_id, payload: { reason: i.payload.reason, note: i.payload.note, at: i.payload.at } });
    else if (i.kind === 'stop_defer') saida.push({ kind: 'stop_defer', stop_id: i.stop_id, payload: { at: i.payload.at } });
    else if (i.kind === 'stop_undo') saida.push({ kind: 'stop_undo', stop_id: i.stop_id, payload: { at: i.payload.at } });
    else if (i.kind === 'route_reoptimize') saida.push({ kind: 'route_reoptimize', payload: { lat: i.payload.lat, lng: i.payload.lng, at: i.payload.at } });
    else if (i.kind === 'checkin' && i.payload.lead_id) saida.push({ kind: 'visita_no_lead', lead_id: i.payload.lead_id });
  }
  return saida;
}

/** Aplica, na ordem, o que o consultor já fez mas o servidor ainda não confirmou. */
export function aplicarAcoesPendentes(route: RouteView, acoes: AcaoRotaPendente[]): RouteView {
  let atual = route;
  const mudar = (id: string, f: (s: StopView) => StopView): RouteView => ({
    ...atual,
    stops: atual.stops.map((s) => (s.id === id ? f(s) : s)),
  });
  for (const a of acoes) {
    switch (a.kind) {
      case 'stop_skip':
        atual = mudar(a.stop_id, (s) =>
          s.status === 'pendente' || s.status === 'adiada'
            ? { ...s, status: 'pulada', skip_reason: a.payload.reason, skip_note: a.payload.note ?? null, deferred_to: null, eta: null, eta_min: null }
            : s,
        );
        break;
      case 'stop_defer':
        atual = mudar(a.stop_id, (s) =>
          s.status === 'pendente'
            ? { ...s, status: 'adiada', deferred_to: minutosSp(a.payload.at) < hhmm(atual.params.almoco_fim) ? 'tarde' : 'amanha', eta: null, eta_min: null }
            : s,
        );
        break;
      case 'stop_undo':
        atual = mudar(a.stop_id, (s) =>
          s.status === 'pulada' || s.status === 'adiada' ? { ...s, status: 'pendente', skip_reason: null, skip_note: null, deferred_to: null } : s,
        );
        break;
      case 'route_reoptimize':
        atual = reordenarSemSinal(atual, a.payload);
        break;
      case 'visita_no_lead':
        // Mesma regra do servidor: só pendente/adiada viram visitada (pulada continua pulada).
        atual = {
          ...atual,
          stops: atual.stops.map((s) => (s.lead_id === a.lead_id && (s.status === 'pendente' || s.status === 'adiada') ? { ...s, status: 'visitada', deferred_to: null } : s)),
        };
        break;
    }
  }
  return atual;
}

/** Três blocos da lista (UX §4.3): feitas/manhã, almoço e tarde, pela hora estimada. */
export function periodoDaParada(s: StopView, params: ConfigRota): 'manha' | 'tarde' {
  if (s.eta_min == null) return s.deferred_to === 'tarde' ? 'tarde' : 'manha';
  return s.eta_min >= hhmm(params.almoco_fim) ? 'tarde' : 'manha';
}

/** Os intervalos do dia em minutos de Brasília (o aberto até agora), para o ritmo do aparelho (lote B §37.6). */
export function pausasEmMinutos(intervalos: readonly { started_at: string; ended_at: string | null }[], agoraMs: number): { ini: number; fim: number }[] {
  return intervalos.map((i) => {
    const ini = minutosSp(i.started_at);
    return { ini, fim: Math.max(ini, minutosSp(i.ended_at ?? agoraMs)) };
  });
}
