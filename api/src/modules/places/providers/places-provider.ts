import type { Coordenada } from '../../../domain/campo-rules';
import type { FonteLugar, LugarNormalizado, TipoLugar } from '../../../domain/places-rules';

/** Pedido a um provedor de estabelecimentos. */
export interface BuscaParams {
  centro: Coordenada;
  raio_m: number;
  types: readonly TipoLugar[];
  /** Quantos lugares, no máximo, o provedor pode trazer (teto de custo/lista). */
  limite: number;
  signal: AbortSignal;
  /** Chamado com o total encontrado até agora (progresso da tela). */
  onProgress?: (encontrados: number) => void;
}

/**
 * Fonte de estabelecimentos. Implementações: Overpass (OSM) e Apify. O serviço
 * só conhece esta interface — o teste injeta um fake e nunca toca a rede.
 */
export interface PlacesProvider {
  readonly id: FonteLugar;
  /** `false` = a fonte não está ligada neste servidor (flag/token). */
  disponivel(): boolean;
  buscar(p: BuscaParams): Promise<LugarNormalizado[]>;
}

/** Falha esperada de provedor. `userMessage` é texto para pessoa: nunca URL, cabeçalho nem token. */
export class ProviderError extends Error {
  constructor(
    readonly userMessage: string,
    /** Detalhe técnico seguro (código HTTP, tentativa) — pode ir ao log. */
    readonly detalhe: string,
  ) {
    super(detalhe);
    this.name = 'ProviderError';
  }
}

export class BuscaCancelada extends Error {
  constructor() {
    super('busca cancelada');
    this.name = 'BuscaCancelada';
  }
}

export type FetchFn = (url: string, init: RequestInit) => Promise<Response>;
export type SleepFn = (ms: number, signal?: AbortSignal) => Promise<void>;

/** Espera `ms`, mas acorda (rejeitando) se a busca for cancelada. */
export const dormir: SleepFn = (ms, signal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new BuscaCancelada());
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new BuscaCancelada());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
