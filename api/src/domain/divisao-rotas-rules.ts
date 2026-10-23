/**
 * Divisão de uma área em N rotas (restante da Lovable, fase L7; contrato §39). Puro: sem Prisma, HTTP nem relógio.
 *
 * Porta de `gerarRotas` da Lovable (`src/lib/rotas.ts:35-64`): ordena os pontos pelo ângulo em volta do centroide e agrupa de
 * forma gulosa até `por_rota` paradas e até caber no tempo — no modelo `lovable`, 20 min/cliente + 1 h de intervalo + km em linha
 * reta ÷ km/h ≤ 600 min; no modelo `roteiro`, a capacidade sai do NOSSO relógio (`calcularRelogio`, janela, almoço, 8 min, rua × 1,3).
 * Determinística (a Lovable não é): a entrada é ordenada por id antes de tudo e todo empate (ângulo, partida, vizinho) cai no id.
 *
 * O roteiro do dia continua o nosso ("Montar roteiro": vizinho mais próximo + 2-opt): ao publicar uma rota do plano, o relógio do
 * roteiro refaz a ordem e os horários. A tela mostra as duas contas.
 */
import { grupoConfig, inteiroEntre, umDe, type GrupoConfig } from './config-grupo';
import { calcularRelogio, caminhadaMin, ruaM, type ParamsPlano } from './rota-rules';

export interface PontoDivisao {
  id: string;
  lat: number;
  lng: number;
}

export const CORES_ROTA = ['#2563eb', '#dc2626', '#16a34a', '#9333ea', '#ea580c', '#0891b2', '#ca8a04', '#db2777'] as const;

export const KINDS_PLANO = ['geral', 'shoppings', 'shopping_interno'] as const;
export type KindPlano = (typeof KINDS_PLANO)[number];
export const MODELOS_TEMPO = ['lovable', 'roteiro'] as const;
export type ModeloTempo = (typeof MODELOS_TEMPO)[number];
export const MODOS_PLANO = ['carro', 'a_pe'] as const;
export type ModoPlano = (typeof MODOS_PLANO)[number];

// ── configuração (`field_config.divisao`) ────────────────────

export interface ConfigDivisao {
  por_rota: number;
  modelo_tempo: ModeloTempo;
  minutos_por_cliente: number;
  intervalo_min: number;
  limite_min: number;
  travel_mode: ModoPlano;
  /** Velocidades da conta da Lovable (`VELOCIDADE_KMH`/`VELOCIDADE_PE_KMH`), em linha reta. */
  kmh_carro: number;
  kmh_pe: number;
}

/** Padrões da spec (arquitetura item 11): os da Lovable; o botão principal dela é "carro/moto". */
export const CONFIG_DIVISAO: GrupoConfig<ConfigDivisao> = grupoConfig<ConfigDivisao>(
  {
    por_rota: 20,
    modelo_tempo: 'lovable',
    minutos_por_cliente: 20,
    intervalo_min: 60,
    limite_min: 600,
    travel_mode: 'carro',
    kmh_carro: 25,
    kmh_pe: 5,
  },
  {
    por_rota: inteiroEntre(1, 100),
    modelo_tempo: umDe(MODELOS_TEMPO),
    minutos_por_cliente: inteiroEntre(1, 120),
    intervalo_min: inteiroEntre(0, 240),
    limite_min: inteiroEntre(60, 1440),
    travel_mode: umDe(MODOS_PLANO),
    kmh_carro: inteiroEntre(5, 80),
    kmh_pe: inteiroEntre(1, 15),
  },
);

// ── geometria (a da Lovable: haversine em km, raio 6.371) ────

export function distKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r;
  const dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function distanciaTotalKm(pts: readonly { lat: number; lng: number }[]): number {
  let t = 0;
  for (let i = 1; i < pts.length; i += 1) t += distKm(pts[i - 1]!, pts[i]!);
  return t;
}

const porId = (a: PontoDivisao, b: PontoDivisao) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Vizinho mais próximo partindo do ponto mais ao norte-oeste (Lovable); empates pelo id. */
export function ordenarVizinhoLovable<T extends PontoDivisao>(pts: readonly T[]): T[] {
  if (pts.length < 2) return [...pts];
  const rest = [...pts].sort((a, b) => b.lat - a.lat || a.lng - b.lng || porId(a, b));
  const out = [rest.shift()!];
  while (rest.length) {
    const last = out[out.length - 1]!;
    let bi = 0;
    let bd = Infinity;
    rest.forEach((p, i) => {
      const d = distKm(last, p);
      if (d < bd) {
        bd = d;
        bi = i;
      }
    });
    out.push(rest.splice(bi, 1)[0]!);
  }
  return out;
}

// ── tempo ────────────────────────────────────────────────────

/** Lovable: paradas × min/cliente + intervalo + deslocamento (km ÷ km/h, arredondado). */
export function tempoPrevistoMin(
  paradas: number,
  km: number,
  kmh = 25,
  c: Pick<ConfigDivisao, 'minutos_por_cliente' | 'intervalo_min'> = CONFIG_DIVISAO.padrao,
): number {
  return paradas * c.minutos_por_cliente + c.intervalo_min + Math.round((km / kmh) * 60);
}

export function formatarDuracao(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}h${m ? String(m).padStart(2, '0') : ''}` : `${m} min`;
}

/** Valor mais frequente (ex.: bairro principal); empate = o primeiro que apareceu. */
export function maisFrequente(vals: readonly (string | null | undefined)[]): string | null {
  const c = new Map<string, number>();
  for (const v of vals) if (v) c.set(v, (c.get(v) ?? 0) + 1);
  let best: string | null = null;
  let n = 0;
  for (const [k, v] of c) {
    if (v > n) {
      best = k;
      n = v;
    }
  }
  return best;
}

// ── divisão ──────────────────────────────────────────────────

export interface ParamsDivisao {
  por_rota: number;
  modelo_tempo: ModeloTempo;
  minutos_por_cliente: number;
  intervalo_min: number;
  limite_min: number;
  /** Velocidade da conta da Lovable (linha reta). */
  kmh: number;
  /** Modelo `roteiro`: os parâmetros do nosso relógio (janela, almoço, minutos por visita, velocidade e desvio do modo). */
  plano?: ParamsPlano;
}

export function paramsDivisao(c: ConfigDivisao, plano?: ParamsPlano): ParamsDivisao {
  return {
    por_rota: c.por_rota,
    modelo_tempo: c.modelo_tempo,
    minutos_por_cliente: c.minutos_por_cliente,
    intervalo_min: c.intervalo_min,
    limite_min: c.limite_min,
    kmh: c.travel_mode === 'a_pe' ? c.kmh_pe : c.kmh_carro,
    ...(plano ? { plano } : {}),
  };
}

/** Quantas paradas da ordem cabem inteiras no relógio do roteiro (sem reserva), partindo da 1ª. */
function cabeNoRelogio(ordem: PontoDivisao[], plano: ParamsPlano): boolean {
  if (ordem.length === 0) return true;
  const r = calcularRelogio({
    inicio: ordem[0]!,
    partidaMin: plano.janelaIni,
    ordem,
    params: { ...plano, meta: ordem.length, reservaMax: 0 },
  });
  return r.paradas.filter((p) => p.kind === 'planejada').length === ordem.length;
}

/**
 * Varredura angular em volta do centroide + agrupamento guloso (Lovable `gerarRotas`). Cada grupo sai na ordem do vizinho mais
 * próximo a partir do norte-oeste. Nenhum ponto se perde: um ponto que sozinho não cabe vira uma rota só dele (como na Lovable).
 */
export function dividirPorVarredura<T extends PontoDivisao>(pontos: readonly T[], p: ParamsDivisao): T[][] {
  if (!pontos.length || p.por_rota < 1) return [];
  const base = [...pontos].sort(porId);
  const c = {
    lat: base.reduce((s, x) => s + x.lat, 0) / base.length,
    lng: base.reduce((s, x) => s + x.lng, 0) / base.length,
  };
  const angulo = (x: PontoDivisao) => Math.atan2(x.lat - c.lat, x.lng - c.lng);
  const sorted = base.sort((a, b) => angulo(a) - angulo(b) || porId(a, b));
  const cabe = (teste: T[]): boolean => {
    if (teste.length > p.por_rota) return false;
    if (p.modelo_tempo === 'roteiro' && p.plano) return cabeNoRelogio(teste, p.plano);
    return tempoPrevistoMin(teste.length, distanciaTotalKm(teste), p.kmh, p) <= p.limite_min;
  };
  const grupos: T[][] = [];
  let atual: T[] = [];
  for (const ponto of sorted) {
    const teste = ordenarVizinhoLovable([...atual, ponto]);
    if (cabe(teste) || !atual.length) atual = teste;
    else {
      grupos.push(ordenarVizinhoLovable(atual));
      atual = [ponto];
    }
  }
  if (atual.length) grupos.push(ordenarVizinhoLovable(atual));
  return grupos;
}

// ── nomes ────────────────────────────────────────────────────

export function nomeDaRota(kind: KindPlano, i: number, total: number, shopping?: string): string {
  if (kind === 'shoppings') return total > 1 && i > 0 ? `Rota dos shoppings ${i + 1}` : 'Rota dos shoppings';
  if (kind === 'shopping_interno') return `Dentro do ${shopping ?? 'shopping'}${total > 1 ? ` — parte ${i + 1}` : ''}`;
  return `Rota ${String(i + 1).padStart(2, '0')}`;
}

export const corDaRota = (i: number): string => CORES_ROTA[i % CORES_ROTA.length]!;

// ── as duas contas ───────────────────────────────────────────

const km1 = (km: number) => km.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const dec = (x: number) => String(x).replace('.', ',');

/** A conta da Lovable, escrita. */
export function contaLovable(
  ordem: readonly PontoDivisao[],
  c: Pick<ConfigDivisao, 'minutos_por_cliente' | 'intervalo_min' | 'limite_min' | 'kmh_carro' | 'kmh_pe'>,
  modo: ModoPlano,
): { minutos: number; texto: string } {
  const kmh = modo === 'a_pe' ? c.kmh_pe : c.kmh_carro;
  const km = distanciaTotalKm(ordem);
  const desl = Math.round((km / kmh) * 60);
  const minutos = ordem.length * c.minutos_por_cliente + c.intervalo_min + desl;
  const intervalo = c.intervalo_min % 60 === 0 ? `${c.intervalo_min / 60} h` : `${c.intervalo_min} min`;
  return {
    minutos,
    texto: `${ordem.length} × ${c.minutos_por_cliente} min + ${intervalo} de intervalo + ${km1(km)} km em linha reta ÷ ${kmh} km/h (${desl} min) = ${formatarDuracao(minutos)} (máx. ${formatarDuracao(c.limite_min)})`,
  };
}

/**
 * A conta do NOSSO relógio (o que vale depois de publicada): N × minutos por visita + rua (linha reta × desvio) ÷ velocidade +
 * almoço se cruzar, a partir do início da janela; e se a rota inteira cabe na janela.
 */
export function contaRelogio(
  ordem: readonly PontoDivisao[],
  plano: ParamsPlano,
): { minutos: number; rua_m: number; coube: boolean; fora: number; texto: string } {
  if (ordem.length === 0) return { minutos: 0, rua_m: 0, coube: true, fora: 0, texto: 'Sem paradas.' };
  const r = calcularRelogio({
    inicio: ordem[0]!,
    partidaMin: plano.janelaIni,
    ordem: [...ordem],
    params: { ...plano, meta: ordem.length, reservaMax: 0 },
  });
  const planejadas = r.paradas.filter((p) => p.kind === 'planejada');
  const ultima = planejadas[planejadas.length - 1];
  const minutos = ultima ? ultima.eta_min! + plano.minutosPorVisita - plano.janelaIni : 0;
  const rua = r.caminho_m;
  const andar = caminhadaMin(rua, plano.velocidadeKmh);
  const almoco = ultima && ultima.eta_min! + plano.minutosPorVisita > plano.almocoIni ? plano.almocoFim - plano.almocoIni : 0;
  const fora = ordem.length - planejadas.length;
  const hh = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const texto =
    `${planejadas.length} × ${plano.minutosPorVisita} min + ${km1(rua / 1000)} km de rua (linha reta × ${dec(plano.fatorDesvio)}) ÷ ${dec(plano.velocidadeKmh)} km/h (${andar} min)` +
    `${almoco ? ` + almoço ${formatarDuracao(almoco)}` : ''} = ${formatarDuracao(minutos)}` +
    (fora === 0
      ? ` (cabe na janela ${hh(plano.janelaIni)}–${hh(plano.janelaFim)})`
      : ` (${fora} ${fora === 1 ? 'parada não cabe' : 'paradas não cabem'} na janela ${hh(plano.janelaIni)}–${hh(plano.janelaFim)})`);
  return { minutos, rua_m: rua, coube: fora === 0, fora, texto };
}

/** Distância de rua estimada da ordem (linha reta × desvio), em metros — a mesma regra das paradas do roteiro. */
export const ruaDaOrdemM = (ordem: readonly PontoDivisao[], fator: number): number =>
  ordem.reduce((s, p, i) => (i === 0 ? 0 : s + ruaM(ordem[i - 1]!, p, fator)), 0);
