import { addDays } from '@/lib/dates';
import { BRASIL } from '@/modules/areas/domain/area-form';

// Regras puras da tela do mapa de calor (contrato §24). Nada de Leaflet nem de React aqui.

export type Camada = 'passagem' | 'visitas' | 'cobertura';
export const CAMADAS: { id: Camada; rotulo: string }[] = [
  { id: 'passagem', rotulo: 'Onde passaram' },
  { id: 'visitas', rotulo: 'Visitas' },
  { id: 'cobertura', rotulo: 'Falta visitar' },
];
export const MAX_DIAS = 92;
export const LADO_MAX_BBOX_GRAUS = 3;

export const AVISO_PASSAGEM =
  'Mostra onde a tela estava aberta: um ponto a cada 5 min e cada visita. Trechos com tela apagada ou sem sinal não aparecem.';

// ── cor ────────────────────────────────────────────────────────────────
// Rampa âmbar com a ponta baixa transparente (UX §5.3): evita azul/ciano/verde, que se
// confundem com água e parque depois do `hue-rotate` dos tiles escuros, e varia a
// luminosidade de forma monótona (escuro: mais claro; claro: mais escuro).
interface Parada {
  t: number;
  cor: [number, number, number];
  alfa: number;
}
const hex = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const PARADAS: Record<'escuro' | 'claro', Parada[]> = {
  escuro: [
    { t: 0, cor: hex('#B4701A'), alfa: 0 },
    { t: 0.15, cor: hex('#B4701A'), alfa: 0.25 },
    { t: 0.4, cor: hex('#ECA826'), alfa: 0.55 },
    { t: 0.7, cor: hex('#FFC857'), alfa: 0.75 },
    { t: 1, cor: hex('#FFC857'), alfa: 0.75 },
  ],
  claro: [
    { t: 0, cor: hex('#F2C36B'), alfa: 0 },
    { t: 0.15, cor: hex('#F2C36B'), alfa: 0.35 },
    { t: 0.4, cor: hex('#E08A12'), alfa: 0.6 },
    { t: 0.7, cor: hex('#B8500A'), alfa: 0.75 },
    { t: 1, cor: hex('#6B240A'), alfa: 0.75 },
  ],
};

/** 0..1 a partir da contagem. Raiz quadrada: poucas quadras muito fortes não apagam as demais. */
export function intensidade(n: number, max: number): number {
  if (!(max > 0) || !(n > 0)) return 0;
  return Math.min(1, Math.sqrt(n / max));
}

export function corDoCalor(t: number, dark: boolean): { cor: string; opacidade: number } {
  const ps = PARADAS[dark ? 'escuro' : 'claro'];
  const x = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0));
  let k = 1;
  while (k < ps.length - 1 && x > ps[k].t) k++;
  const a = ps[k - 1];
  const b = ps[k];
  const f = b.t === a.t ? 1 : (x - a.t) / (b.t - a.t);
  const c = a.cor.map((v, i) => Math.round(v + (b.cor[i] - v) * f));
  return { cor: `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`, opacidade: Math.round((a.alfa + (b.alfa - a.alfa) * f) * 1000) / 1000 };
}

/** Degradê CSS da legenda (a mesma rampa do mapa). */
export function degradeDaLegenda(dark: boolean): string {
  const passos = [0, 0.15, 0.4, 0.7, 1].map((t) => {
    const { cor, opacidade } = corDoCalor(t, dark);
    const [r, g, b] = hex(cor);
    return `rgba(${r}, ${g}, ${b}, ${opacidade}) ${Math.round(t * 100)}%`;
  });
  return `linear-gradient(to right, ${passos.join(', ')})`;
}

// ── grade e recorte ────────────────────────────────────────────────────
/** Tamanho da quadra pelo zoom do mapa (o servidor ainda sobe sozinho se passar de 5.000 quadras). */
export function celulaPorZoom(zoom: number): 100 | 250 | 500 | 1000 {
  if (zoom >= 16) return 100;
  if (zoom >= 14) return 250;
  if (zoom >= 12) return 500;
  return 1000;
}

export interface Janela {
  south: number;
  west: number;
  north: number;
  east: number;
}

/**
 * Recorte `sul,oeste,norte,leste` para o servidor: dentro do Brasil, arredondado PARA FORA em
 * 3 casas (nunca corta a quadra da borda) e `null` se passar de 3° de lado (o servidor recusaria).
 */
export function bboxDaJanela(j: Janela): string | null {
  const sul = Math.max(j.south, BRASIL.latMin);
  const norte = Math.min(j.north, BRASIL.latMax);
  const oeste = Math.max(j.west, BRASIL.lngMin);
  const leste = Math.min(j.east, BRASIL.lngMax);
  if (![sul, norte, oeste, leste].every(Number.isFinite) || sul >= norte || oeste >= leste) return null;
  const r = (v: number, f: (x: number) => number) => f(v * 1000) / 1000;
  const [s, n, o, l] = [r(sul, Math.floor), r(norte, Math.ceil), r(oeste, Math.floor), r(leste, Math.ceil)];
  if (n - s > LADO_MAX_BBOX_GRAUS || l - o > LADO_MAX_BBOX_GRAUS) return null;
  return [s, o, n, l].join(',');
}

/** Cantos da quadra a partir do centro e do tamanho devolvidos pelo servidor. */
export function cantosDaCelula(c: { lat: number; lng: number }, t: { dlat: number; dlng: number }): [[number, number], [number, number]] {
  return [
    [c.lat - t.dlat / 2, c.lng - t.dlng / 2],
    [c.lat + t.dlat / 2, c.lng + t.dlng / 2],
  ];
}

// ── período ────────────────────────────────────────────────────────────
export type PresetPeriodo = 'hoje' | '7d' | '30d';
export const PRESETS: { id: PresetPeriodo; rotulo: string }[] = [
  { id: 'hoje', rotulo: 'Hoje' },
  { id: '7d', rotulo: '7 dias' },
  { id: '30d', rotulo: '30 dias' },
];
export function periodoDoPreset(p: PresetPeriodo, hoje: string): { from: string; to: string } {
  return { from: p === 'hoje' ? hoje : addDays(hoje, p === '7d' ? -6 : -29), to: hoje };
}
export function presetDoPeriodo(from: string, to: string, hoje: string): PresetPeriodo | null {
  return PRESETS.find((p) => {
    const x = periodoDoPreset(p.id, hoje);
    return x.from === from && x.to === to;
  })?.id ?? null;
}
const diasEntre = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
/** Mensagem para a pessoa, ou `null` se o período é válido. */
export function erroDoPeriodo(from: string, to: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return 'Escolha as duas datas.';
  if (from > to) return 'A data inicial vem depois da final.';
  if (diasEntre(from, to) + 1 > MAX_DIAS) return `Escolha no máximo ${MAX_DIAS} dias.`;
  return null;
}
export const brData = (d: string) => d.split('-').reverse().join('/');
export const rotuloPeriodo = (from: string, to: string) => (from === to ? brData(from) : `${brData(from)} a ${brData(to)}`);

// ── URL ────────────────────────────────────────────────────────────────
export interface Filtros {
  praca: string | null;
  consultor: string | null;
  camada: Camada;
  from: string;
  to: string;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DIA = /^\d{4}-\d{2}-\d{2}$/;
/** Lê `?praca&consultor&camada&de&ate`; valor estranho cai no padrão (visitas, últimos 7 dias). */
export function lerFiltros(p: { get(k: string): string | null }, hoje: string): Filtros {
  const camada = CAMADAS.find((c) => c.id === p.get('camada'))?.id ?? 'visitas';
  const padrao = periodoDoPreset('7d', hoje);
  const de = p.get('de');
  const ate = p.get('ate');
  const ok = de && ate && DIA.test(de) && DIA.test(ate);
  const praca = p.get('praca');
  const consultor = p.get('consultor');
  return {
    praca: praca && UUID.test(praca) ? praca : null,
    consultor: consultor && UUID.test(consultor) ? consultor : null,
    camada,
    from: ok ? de : padrao.from,
    to: ok ? ate : padrao.to,
  };
}
export function filtrosParaQuery(f: Filtros): string {
  const q = new URLSearchParams();
  if (f.praca) q.set('praca', f.praca);
  if (f.consultor) q.set('consultor', f.consultor);
  q.set('camada', f.camada);
  q.set('de', f.from);
  q.set('ate', f.to);
  return q.toString();
}

// ── textos ─────────────────────────────────────────────────────────────
export const fmtN = (n: number) => n.toLocaleString('pt-BR');
export const plural = (n: number, um: string, varios: string) => `${fmtN(n)} ${n === 1 ? um : varios}`;
const rotuloLado = (m: number) => (m >= 1000 ? `${m / 1000} km` : `${m} m`);

/** A conta da legenda: o que é uma quadra, o que a cor mede e quanto vale a mais forte. */
export function textoLegenda(camada: Camada, ladoM: number, max: number): string {
  const quadra = `Cada quadra do mapa tem cerca de ${rotuloLado(ladoM)} de lado.`;
  if (camada === 'visitas') return `${quadra} A cor mostra quantas visitas (check-ins) houve na quadra; a mais forte tem ${plural(max, 'visita', 'visitas')}.`;
  if (camada === 'cobertura')
    return `${quadra} A cor mostra quantos estabelecimentos da quadra ainda não receberam visita no período; a mais forte tem ${plural(max, 'sem visita', 'sem visita')}.`;
  return `${quadra} A cor mostra quantos pontos de trajeto foram gravados na quadra (cerca de 5 min cada, só com a tela aberta); a mais forte tem ${plural(max, 'ponto', 'pontos')} (≈ ${fmtN(max * 5)} min).`;
}

export interface CelulaCalor {
  lat: number;
  lng: number;
  n: number;
  leads?: number;
  minutes?: number;
  total?: number;
  visited?: number;
}

/** Texto de uma quadra (tooltip e lista). Só números, sem nome de lugar. */
export function textoDaQuadra(camada: Camada, c: CelulaCalor): string {
  if (camada === 'visitas') return `${plural(c.n, 'visita', 'visitas')} em ${plural(c.leads ?? 0, 'estabelecimento', 'estabelecimentos')}`;
  if (camada === 'cobertura') return `${plural(c.n, 'sem visita', 'sem visita')} de ${plural(c.total ?? 0, 'estabelecimento', 'estabelecimentos')}`;
  return `${plural(c.n, 'ponto', 'pontos')} (≈ ${fmtN(c.minutes ?? 0)} min)`;
}

/** Lista equivalente ao mapa (leitor de tela): as quadras mais fortes, com a posição aproximada do centro. */
export function quadrasMaisIntensas(cells: CelulaCalor[], camada: Camada, limite = 10) {
  return [...cells]
    .sort((a, b) => b.n - a.n || a.lat - b.lat || a.lng - b.lng)
    .slice(0, limite)
    .map((c, k) => ({
      pos: k + 1,
      ref: `${c.lat.toFixed(4).replace('.', ',')}, ${c.lng.toFixed(4).replace('.', ',')}`,
      texto: textoDaQuadra(camada, c),
    }));
}
