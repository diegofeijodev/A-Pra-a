/**
 * Roteirização do dia do consultor de campo — spec 2026-10-19, §4.2 e §6.1.
 *
 * Funções PURAS (sem Prisma, HTTP nem relógio do sistema): o serviço lê as
 * linhas, passa a hora de Brasília em minutos e grava o que sai daqui.
 *
 * Heurística local, sem serviço externo: vizinho mais próximo + 2-opt sobre a
 * distância haversine (`distanciaM`), depois "relógio" que converte linha reta
 * em caminhada de rua (× `fatorDesvio`, a `velocidadeKmh`), respeita a janela de
 * trabalho e o almoço e corta na meta. Determinística: empate por id, 2-opt só
 * com ganho estrito, nada de sorteio nem ordem de Set/Map.
 */
import { distanciaM, type Coordenada } from './campo-rules';

export const RESERVA_MAX = 10;

/** Modo de deslocamento do roteiro (contrato §30.4). */
export const MODOS_DESLOCAMENTO = ['a_pe', 'carro'] as const;
export type ModoDeslocamento = (typeof MODOS_DESLOCAMENTO)[number];
/** Média urbana de carro em movimento (sem estacionar), km/h — valor de partida a validar com os consultores. */
export const VELOCIDADE_CARRO_PADRAO = 25;

export interface PontoRota extends Coordenada {
  id: string;
  /** Âncora: mantém a posição; o resto é reordenado dentro de cada trecho entre duas fixas. */
  fixa?: boolean;
  /** Adiada para a tarde: vai para o fim do roteiro e não chega antes do fim do almoço. */
  depois?: boolean;
}

/** Tudo em minutos desde 00:00 de Brasília. */
export interface ParamsPlano {
  meta: number;
  janelaIni: number;
  janelaFim: number;
  almocoIni: number;
  almocoFim: number;
  minutosPorVisita: number;
  velocidadeKmh: number;
  fatorDesvio: number;
  reservaMax?: number;
}

export interface ParadaPlano {
  id: string;
  /** Começa depois das paradas já visitadas (`jaFeitas`). */
  seq: number;
  kind: 'planejada' | 'reserva';
  /** Chegada estimada; nula na reserva. */
  eta_min: number | null;
  /** Trecho de rua estimado desde a parada anterior (ou o ponto de partida), em metros. */
  distancia_m: number;
}

export interface Plano {
  paradas: ParadaPlano[];
  /** Ids que nem como reserva couberam. */
  excedentes: string[];
  /** Soma dos trechos de rua das paradas planejadas, em metros. */
  caminho_m: number;
  /** A meta restante coube na janela. */
  coube: boolean;
}

// ── horários ────────────────────────────────────────────────

/** "09:30" → 570; `null` quando o texto não é um horário válido. */
export function hhmmParaMin(s: unknown): number | null {
  if (typeof s !== 'string') return null;
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(s);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function minParaHhmm(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

// ── configuração (app_settings.field_config) ────────────────

export interface ConfigRota {
  meta_diaria: number;
  janela_inicio: string;
  janela_fim: string;
  almoco_inicio: string;
  almoco_fim: string;
  minutos_por_visita: number;
  velocidade_kmh: number;
  fator_desvio: number;
  pool_fator: number;
  dias_sem_revisitar: number;
  estagio_maximo_rota: number;
  gerar_ao_iniciar: boolean;
  consultor_pode_gerar: boolean;
}

export const CONFIG_ROTA_PADRAO: ConfigRota = {
  meta_diaria: 30,
  janela_inicio: '09:00',
  janela_fim: '18:00',
  almoco_inicio: '12:00',
  almoco_fim: '13:00',
  minutos_por_visita: 8,
  velocidade_kmh: 4.5,
  fator_desvio: 1.3,
  pool_fator: 1.5,
  dias_sem_revisitar: 14,
  estagio_maximo_rota: 4,
  gerar_ao_iniciar: false,
  consultor_pode_gerar: false,
};

const inteiro = (min: number, max: number) => (v: unknown) => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
const decimal = (min: number, max: number) => (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const horario = (v: unknown) => hhmmParaMin(v) !== null;
const booleano = (v: unknown) => typeof v === 'boolean';

const VALIDADORES: Record<keyof ConfigRota, (v: unknown) => boolean> = {
  meta_diaria: inteiro(1, 100),
  janela_inicio: horario,
  janela_fim: horario,
  almoco_inicio: horario,
  almoco_fim: horario,
  minutos_por_visita: inteiro(1, 120),
  velocidade_kmh: decimal(1, 15),
  fator_desvio: decimal(1, 3),
  pool_fator: decimal(1, 5),
  dias_sem_revisitar: inteiro(0, 365),
  estagio_maximo_rota: inteiro(1, 6),
  gerar_ao_iniciar: booleano,
  consultor_pode_gerar: booleano,
};

export const CHAVES_CONFIG_ROTA = Object.keys(VALIDADORES) as (keyof ConfigRota)[];

/** Coerência entre horários; `null` = válida. */
export function validarHorarios(c: Pick<ConfigRota, 'janela_inicio' | 'janela_fim' | 'almoco_inicio' | 'almoco_fim'>): string | null {
  const ji = hhmmParaMin(c.janela_inicio)!;
  const jf = hhmmParaMin(c.janela_fim)!;
  const ai = hhmmParaMin(c.almoco_inicio)!;
  const af = hhmmParaMin(c.almoco_fim)!;
  if (ji >= jf) return 'janela_inicio: precisa ser antes de janela_fim.';
  if (ai >= af) return 'almoco_inicio: precisa ser antes de almoco_fim.';
  if (ai < ji || af > jf) return 'almoco_inicio: o almoço precisa caber dentro da janela de trabalho.';
  return null;
}

/**
 * Lê o JSON do banco: chave ausente ou inválida cai no padrão (o banco pode
 * ter sido editado à mão) e horários incoerentes voltam ao padrão juntos.
 */
export function lerConfigRota(raw: unknown): ConfigRota {
  const base = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const c: Record<string, unknown> = { ...CONFIG_ROTA_PADRAO };
  for (const k of CHAVES_CONFIG_ROTA) if (VALIDADORES[k](base[k])) c[k] = base[k];
  const cfg = c as unknown as ConfigRota;
  if (validarHorarios(cfg)) {
    cfg.janela_inicio = CONFIG_ROTA_PADRAO.janela_inicio;
    cfg.janela_fim = CONFIG_ROTA_PADRAO.janela_fim;
    cfg.almoco_inicio = CONFIG_ROTA_PADRAO.almoco_inicio;
    cfg.almoco_fim = CONFIG_ROTA_PADRAO.almoco_fim;
  }
  return cfg;
}

/** Valida um PUT parcial; devolve a configuração final ou a lista de erros por chave. */
export function aplicarConfigRota(atual: ConfigRota, parcial: Record<string, unknown>): { ok: true; config: ConfigRota } | { ok: false; erro: string } {
  const novo: Record<string, unknown> = { ...atual };
  for (const [k, v] of Object.entries(parcial)) {
    if (!(k in VALIDADORES)) return { ok: false, erro: `${k}: campo desconhecido.` };
    if (!VALIDADORES[k as keyof ConfigRota](v)) return { ok: false, erro: `${k}: valor fora do permitido.` };
    novo[k] = v;
  }
  const cfg = novo as unknown as ConfigRota;
  const h = validarHorarios(cfg);
  return h ? { ok: false, erro: h } : { ok: true, config: cfg };
}

/** A pé: a velocidade da configuração; carro: a do carro (do env, fotografada no roteiro). Modo desconhecido = a pé. */
export function velocidadeDoModo(modo: string, c: Pick<ConfigRota, 'velocidade_kmh'>, kmhCarro: number): number {
  return modo === 'carro' ? kmhCarro : c.velocidade_kmh;
}

/** A conta escrita do modo, para a tela (regra "todo número diz o que é e a conta"). */
export function textoDoModo(modo: string, kmh: number, fator: number): string {
  const n = (x: number) => String(x).replace('.', ',');
  return modo === 'carro'
    ? `De carro: ${n(kmh)} km/h × desvio de rua ${n(fator)} (média urbana, sem estacionar)`
    : `A pé: ${n(kmh)} km/h × desvio de rua ${n(fator)}`;
}

/** `velocidadeKmh` opcional troca só a velocidade (modo carro); sem ele é a de caminhada da configuração. */
export function paramsDaConfig(c: ConfigRota, velocidadeKmh?: number): ParamsPlano {
  return {
    meta: c.meta_diaria,
    janelaIni: hhmmParaMin(c.janela_inicio)!,
    janelaFim: hhmmParaMin(c.janela_fim)!,
    almocoIni: hhmmParaMin(c.almoco_inicio)!,
    almocoFim: hhmmParaMin(c.almoco_fim)!,
    minutosPorVisita: c.minutos_por_visita,
    velocidadeKmh: velocidadeKmh ?? c.velocidade_kmh,
    fatorDesvio: c.fator_desvio,
  };
}

// ── geometria ───────────────────────────────────────────────

/** Trecho de rua estimado: linha reta × fator de desvio, em metros inteiros. */
export const ruaM = (a: Coordenada, b: Coordenada, fator: number): number => Math.round(distanciaM(a, b) * fator);

/** Minutos de caminhada (arredonda para cima: nunca promete chegar antes). */
export const caminhadaMin = (metros: number, kmh: number): number => Math.ceil(metros / ((kmh * 1000) / 60));

/** Comprimento do caminho aberto (linha reta) `inicio → s[0] → … → s[k-1] (→ fim)`. */
export function custoCaminhoM(inicio: Coordenada, s: Coordenada[], fim?: Coordenada): number {
  let total = 0;
  let prev = inicio;
  for (const p of s) {
    total += distanciaM(prev, p);
    prev = p;
  }
  if (fim) total += distanciaM(prev, fim);
  return total;
}

const porId = (a: PontoRota, b: PontoRota): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Vizinho mais próximo encadeado a partir de `inicio`; empate pelo menor id. */
export function ordenarVizinhoMaisProximo(inicio: Coordenada, pontos: PontoRota[]): PontoRota[] {
  const restantes = [...pontos].sort(porId);
  const saida: PontoRota[] = [];
  let atual: Coordenada = inicio;
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

/** 2-opt em caminho aberto com início fixo (e fim fixo opcional). Só aceita ganho estrito. */
export function melhorarDoisOpt(inicio: Coordenada, pontos: PontoRota[], fim?: Coordenada): PontoRota[] {
  const s = [...pontos];
  const k = s.length;
  if (k < 2) return s;
  for (let passada = 0; passada < 200; passada += 1) {
    let melhorou = false;
    for (let i = 0; i < k - 1; i += 1) {
      for (let j = i + 1; j < k; j += 1) {
        const a = i === 0 ? inicio : s[i - 1]!;
        const b = s[i]!;
        const c = s[j]!;
        const d = j + 1 < k ? s[j + 1]! : (fim ?? null);
        const antes = distanciaM(a, b) + (d ? distanciaM(c, d) : 0);
        const depois = distanciaM(a, c) + (d ? distanciaM(b, d) : 0);
        if (depois < antes) {
          const trecho = s.slice(i, j + 1).reverse();
          s.splice(i, trecho.length, ...trecho);
          melhorou = true;
        }
      }
    }
    if (!melhorou) break;
  }
  return s;
}

/** Vizinho mais próximo + 2-opt de um trecho livre, entre `inicio` e um `fim` fixo opcional. */
export function ordenarTrecho(inicio: Coordenada, pontos: PontoRota[], fim?: Coordenada): PontoRota[] {
  return melhorarDoisOpt(inicio, ordenarVizinhoMaisProximo(inicio, pontos), fim);
}

/**
 * Ordena respeitando as fixas: `pontos` vem NA ORDEM ATUAL; cada fixa é âncora e o
 * que está entre duas âncoras é reordenado só dentro daquele trecho.
 */
export function ordenarComFixas(inicio: Coordenada, pontos: PontoRota[]): PontoRota[] {
  const saida: PontoRota[] = [];
  let livres: PontoRota[] = [];
  let prev: Coordenada = inicio;
  for (const p of pontos) {
    if (p.fixa) {
      saida.push(...ordenarTrecho(prev, livres, p));
      saida.push(p);
      prev = p;
      livres = [];
    } else {
      livres.push(p);
    }
  }
  saida.push(...ordenarTrecho(prev, livres));
  return saida;
}

function semRepetidos(pontos: PontoRota[]): PontoRota[] {
  const vistos = new Set<string>();
  return pontos.filter((p) => (vistos.has(p.id) ? false : (vistos.add(p.id), true)));
}

// ── relógio ─────────────────────────────────────────────────

export interface EntradaRelogio {
  inicio: Coordenada;
  /** Hora de saída (min). Antes de `janelaIni` vale `janelaIni`. */
  partidaMin: number;
  /** Já NA ORDEM de visita. */
  ordem: PontoRota[];
  params: ParamsPlano;
  /** Visitas já feitas: abatem a meta e deslocam o `seq`. */
  jaFeitas?: number;
}

/**
 * Simula o dia: `t += deslocamento + minutosPorVisita`. Chegada dentro do almoço
 * vira o fim do almoço; sair para a próxima parada durante o almoço, idem. Para na
 * meta restante ou quando a visita estouraria `janelaFim`; o que sobra vira reserva
 * (até `reservaMax`) e o resto, excedente.
 */
export function calcularRelogio(e: EntradaRelogio): Plano {
  const { params: p } = e;
  const feitas = e.jaFeitas ?? 0;
  const metaRestante = Math.max(p.meta - feitas, 0);
  const reservaMax = p.reservaMax ?? RESERVA_MAX;
  const paradas: ParadaPlano[] = [];
  const excedentes: string[] = [];
  let t = Math.max(e.partidaMin, p.janelaIni);
  let prev: Coordenada = e.inicio;
  let cheio = false;
  let caminho = 0;
  let reservas = 0;

  const noAlmoco = (m: number) => m >= p.almocoIni && m < p.almocoFim;
  const reservar = (ponto: PontoRota) => {
    if (reservas >= reservaMax) {
      excedentes.push(ponto.id);
      return;
    }
    reservas += 1;
    paradas.push({
      id: ponto.id,
      seq: feitas + paradas.length + 1,
      kind: 'reserva',
      eta_min: null,
      distancia_m: ruaM(prev, ponto, p.fatorDesvio),
    });
  };

  let planejadas = 0;
  for (const ponto of e.ordem) {
    if (cheio || planejadas >= metaRestante) {
      cheio = true;
      reservar(ponto);
      continue;
    }
    if (noAlmoco(t)) t = p.almocoFim;
    const dist = ruaM(prev, ponto, p.fatorDesvio);
    let chegada = t + caminhadaMin(dist, p.velocidadeKmh);
    if (ponto.depois) chegada = Math.max(chegada, p.almocoFim);
    if (noAlmoco(chegada)) chegada = p.almocoFim;
    if (chegada + p.minutosPorVisita > p.janelaFim) {
      cheio = true;
      reservar(ponto);
      continue;
    }
    paradas.push({ id: ponto.id, seq: feitas + paradas.length + 1, kind: 'planejada', eta_min: chegada, distancia_m: dist });
    planejadas += 1;
    caminho += dist;
    t = chegada + p.minutosPorVisita;
    prev = ponto;
  }
  return { paradas, excedentes, caminho_m: caminho, coube: planejadas >= metaRestante };
}

/**
 * Monta (ou remonta) o roteiro: ordena e simula o relógio. Serve para a montagem
 * inicial e para a reotimização — nesta, `inicio` é a posição atual, `jaFeitas` o
 * número de paradas visitadas e `pontos` as pendentes na ordem atual, seguidas
 * das reservas e das adiadas para a tarde (`depois`).
 */
export function planejar(e: Omit<EntradaRelogio, 'ordem'> & { pontos: PontoRota[] }): Plano {
  const unicos = semRepetidos(e.pontos);
  const normais = unicos.filter((p) => !p.depois);
  const tarde = unicos.filter((p) => p.depois).map((p) => ({ ...p, fixa: false }));
  const ordemNormal = ordenarComFixas(e.inicio, normais);
  const ultimo: Coordenada = ordemNormal[ordemNormal.length - 1] ?? e.inicio;
  const ordem = [...ordemNormal, ...ordenarTrecho(ultimo, tarde)];
  return calcularRelogio({ inicio: e.inicio, partidaMin: e.partidaMin, ordem, params: e.params, jaFeitas: e.jaFeitas });
}

/**
 * Retornos vencidos ancorados no começo do roteiro (§25.6, §30.3): os combinados para HOJE com hora
 * vêm primeiro, por hora (empate: ordem recebida); os demais seguem o vizinho mais próximo a partir
 * do último ponto já ocupado. O relógio do roteiro não espera a hora marcada — é só ordem.
 */
export function ordenarRetornosAncorados<T extends PontoRota & { hora?: string | null }>(inicio: Coordenada, retornos: T[]): T[] {
  const comHora = retornos.map((r, i) => ({ r, i })).filter((x) => !!x.r.hora);
  comHora.sort((a, b) => (a.r.hora! < b.r.hora! ? -1 : a.r.hora! > b.r.hora! ? 1 : a.i - b.i));
  const marcados = comHora.map((x) => x.r);
  const resto = retornos.filter((r) => !r.hora);
  const ultimo: Coordenada = marcados[marcados.length - 1] ?? inicio;
  return [...marcados, ...(ordenarVizinhoMaisProximo(ultimo, resto) as T[])];
}

/** Seleção automática: cluster contíguo (vizinho mais próximo encadeado), não "as N mais próximas de um ponto". */
export function selecionarEncadeados(inicio: Coordenada, candidatos: PontoRota[], n: number): PontoRota[] {
  return ordenarVizinhoMaisProximo(inicio, semRepetidos(candidatos)).slice(0, Math.max(n, 0));
}

/**
 * Reordenação de emergência (sem servidor): mais próximo em linha reta, sem 2-opt
 * nem relógio. As fixas ficam onde estão.
 */
export function reordenarLinhaReta(inicio: Coordenada, pontos: PontoRota[]): PontoRota[] {
  const saida: PontoRota[] = [];
  let livres: PontoRota[] = [];
  let prev: Coordenada = inicio;
  for (const p of pontos) {
    if (p.fixa) {
      saida.push(...ordenarVizinhoMaisProximo(prev, livres), p);
      prev = p;
      livres = [];
    } else {
      livres.push(p);
    }
  }
  saida.push(...ordenarVizinhoMaisProximo(prev, livres));
  return saida;
}

// ── ritmo ───────────────────────────────────────────────────

/** Minutos de trabalho (janela menos almoço) já decorridos às `agoraMin`. */
export function minutosUteisAte(agoraMin: number, p: Pick<ParamsPlano, 'janelaIni' | 'janelaFim' | 'almocoIni' | 'almocoFim'>): number {
  const t = Math.min(Math.max(agoraMin, p.janelaIni), p.janelaFim);
  const almoco = Math.max(0, Math.min(t, p.almocoFim) - p.almocoIni);
  return t - p.janelaIni - almoco;
}

export interface Ritmo {
  meta: number;
  feitas: number;
  /** Quantas já deveriam estar feitas agora. */
  esperadas: number;
  /** Positivo = à frente. */
  delta: number;
  faltam: number;
  /** Minutos úteis do dia por visita (a conta mostrada na tela). */
  minutos_por_visita_ritmo: number;
}

export function ritmo(e: { agoraMin: number; feitas: number; params: ParamsPlano }): Ritmo {
  const { params: p } = e;
  const totalUtil = p.janelaFim - p.janelaIni - Math.max(p.almocoFim - p.almocoIni, 0);
  const porVisita = p.meta > 0 ? totalUtil / p.meta : totalUtil;
  const esperadas = p.meta > 0 ? Math.min(p.meta, Math.floor(minutosUteisAte(e.agoraMin, p) / porVisita)) : 0;
  return {
    meta: p.meta,
    feitas: e.feitas,
    esperadas,
    delta: e.feitas - esperadas,
    faltam: Math.max(p.meta - e.feitas, 0),
    minutos_por_visita_ritmo: Math.round(porVisita * 10) / 10,
  };
}
