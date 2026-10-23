import { MAX_ELEMENTOS_OVERPASS, montarQueryOverpass, normalizarOverpass, type LugarNormalizado } from '../../../domain/places-rules';
import { montarQuerySegmentos, normalizarOverpassSegmentos, seletorRaio } from '../../../domain/segmentos-rules';
import { montarQueryLojas, montarQueryShoppings, normalizarShoppings } from '../../../domain/shopping-rules';
import {
  BuscaCancelada,
  ProviderError,
  type BuscaParams,
  type FetchFn,
  type PlacesProvider,
  type SleepFn,
} from './places-provider';

export interface OverpassConfig {
  url: string;
  userAgent: string;
  fetch: FetchFn;
  sleep: SleepFn;
  /** Quanto esperar uma resposta antes de desistir (a consulta tem `[timeout:25]` no servidor). */
  timeoutMs?: number;
  /** Intervalo mínimo entre duas requisições ao mesmo Overpass (uso educado da instância pública). */
  minIntervalMs?: number;
  /** Esperas entre tentativas quando o servidor responde 429/5xx/timeout. */
  esperasMs?: readonly number[];
  agora?: () => number;
}

const ESPERAS_PADRAO = [5_000, 15_000, 30_000] as const;
const ESPERA_MAXIMA_MS = 60_000;

/**
 * OpenStreetMap via Overpass API. Sem chave; instância pública é compartilhada,
 * então: `User-Agent` identificado, uma requisição por vez (o serviço serializa
 * as buscas e este adaptador ainda guarda um intervalo mínimo), timeout e espera
 * crescente em 429/502/503/504 respeitando `Retry-After`.
 */
export class OverpassProvider implements PlacesProvider {
  readonly id = 'osm' as const;
  private ultimaRequisicao = 0;

  constructor(private readonly cfg: OverpassConfig) {}

  disponivel(): boolean {
    return true;
  }

  async buscar(p: BuscaParams): Promise<LugarNormalizado[]> {
    if (p.modo?.kind === 'shoppings') return this.buscarShoppings(p);
    if (p.modo?.kind === 'lojas') return this.buscarLojas(p, p.modo);
    const query = p.segmentos
      ? montarQuerySegmentos(p.segmentos, seletorRaio(p.centro, p.raio_m))
      : montarQueryOverpass(p.centro, p.raio_m, p.types);
    const json = await this.consultar(query, p);
    const lugares = p.segmentos ? normalizarOverpassSegmentos(json, p.segmentos) : normalizarOverpass(json);
    p.onProgress?.(lugares.length);
    return lugares;
  }

  /** Lote D (§40.3): `shop=mall` com a geometria; as métricas do polígono vão em `metrics`. */
  private async buscarShoppings(p: BuscaParams): Promise<LugarNormalizado[]> {
    const json = await this.consultar(montarQueryShoppings(p.centro, p.raio_m), p);
    const lugares = normalizarShoppings(json).map((s) => ({ ...s.lugar, metrics: { ...s.metricas } }));
    p.onProgress?.(lugares.length);
    return lugares;
  }

  /** Lote D (§40.3): lojas dentro do polígono; nada veio (área não gerada no Overpass) → em volta, no raio (menos confiável). */
  private async buscarLojas(p: BuscaParams, modo: Extract<NonNullable<BuscaParams['modo']>, { kind: 'lojas' }>): Promise<LugarNormalizado[]> {
    const segmentos = p.segmentos ?? [];
    let alvo = modo.alvo;
    let json = await this.consultar(montarQueryLojas(segmentos, alvo), p);
    let lugares = normalizarOverpassSegmentos(json, segmentos);
    if (alvo.tipo === 'area' && lugares.length === 0) {
      alvo = { tipo: 'raio', centro: modo.reserva.centro, raio_m: modo.reserva.raio_m };
      json = await this.consultar(montarQueryLojas(segmentos, alvo), p);
      lugares = normalizarOverpassSegmentos(json, segmentos);
    }
    p.onAlvo?.(alvo.tipo);
    p.onProgress?.(lugares.length);
    return lugares;
  }

  /** Uma consulta com as esperas de hoje (429/5xx/timeout); devolve o JSON cru. */
  private async consultar(query: string, p: BuscaParams): Promise<unknown> {
    const esperas = this.cfg.esperasMs ?? ESPERAS_PADRAO;
    const tentativas = esperas.length + 1;

    for (let i = 0; i < tentativas; i++) {
      await this.respeitarIntervalo(p.signal);
      const r = await this.requisitar(query, p.signal);
      if (r.tipo === 'ok') {
        const elementos = (r.json as { elements?: unknown[] }).elements;
        if (Array.isArray(elementos) && elementos.length >= MAX_ELEMENTOS_OVERPASS) p.onParcial?.();
        return r.json;
      }
      if (r.tipo === 'fatal') throw new ProviderError(r.userMessage, r.detalhe);
      if (i === tentativas - 1) {
        throw new ProviderError(
          'A busca não funcionou agora. Nada foi cobrado.',
          `overpass indisponível após ${tentativas} tentativas (${r.detalhe})`,
        );
      }
      const espera = Math.min(r.retryAfterMs ?? esperas[i]!, ESPERA_MAXIMA_MS);
      await this.cfg.sleep(espera, p.signal);
    }
    /* istanbul ignore next — o laço sempre retorna ou lança */
    throw new ProviderError('A busca não funcionou agora. Nada foi cobrado.', 'overpass: laço esgotado');
  }

  private async respeitarIntervalo(signal: AbortSignal) {
    const minimo = this.cfg.minIntervalMs ?? 2_000;
    const agora = (this.cfg.agora ?? Date.now)();
    const falta = this.ultimaRequisicao + minimo - agora;
    if (this.ultimaRequisicao > 0 && falta > 0) await this.cfg.sleep(falta, signal);
    this.ultimaRequisicao = (this.cfg.agora ?? Date.now)();
  }

  private async requisitar(
    query: string,
    signal: AbortSignal,
  ): Promise<
    | { tipo: 'ok'; json: unknown }
    | { tipo: 'repetir'; detalhe: string; retryAfterMs?: number }
    | { tipo: 'fatal'; userMessage: string; detalhe: string }
  > {
    const limite = new AbortController();
    const timer = setTimeout(() => limite.abort(), this.cfg.timeoutMs ?? 90_000);
    const aoCancelar = () => limite.abort();
    signal.addEventListener('abort', aoCancelar, { once: true });
    try {
      const resp = await this.cfg.fetch(this.cfg.url, {
        method: 'POST',
        headers: {
          'User-Agent': this.cfg.userAgent,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: limite.signal,
      });
      if (resp.status === 429 || resp.status === 502 || resp.status === 503 || resp.status === 504) {
        return { tipo: 'repetir', detalhe: `HTTP ${resp.status}`, retryAfterMs: retryAfterMs(resp.headers.get('retry-after')) };
      }
      if (!resp.ok) {
        return {
          tipo: 'fatal',
          userMessage: 'A fonte de dados recusou a consulta. Tente uma área menor.',
          detalhe: `overpass HTTP ${resp.status}`,
        };
      }
      const json = (await resp.json()) as { remark?: string; elements?: unknown[] };
      // Estourou o tempo no servidor: responde 200 com `remark` e lista incompleta.
      if (typeof json.remark === 'string' && /runtime error|timed out|out of memory/i.test(json.remark)) {
        return { tipo: 'repetir', detalhe: 'overpass remark: tempo/memória esgotados' };
      }
      return { tipo: 'ok', json };
    } catch {
      if (signal.aborted) throw new BuscaCancelada();
      // Timeout nosso, DNS, conexão, JSON torto: tratados como indisponibilidade passageira.
      return { tipo: 'repetir', detalhe: limite.signal.aborted ? 'timeout' : 'falha de rede' };
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', aoCancelar);
    }
  }
}

function retryAfterMs(h: string | null): number | undefined {
  if (!h) return undefined;
  const s = Number(h);
  return Number.isFinite(s) && s >= 0 ? s * 1000 : undefined;
}
