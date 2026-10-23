import { normalizarApify, type LugarNormalizado, type TipoLugar } from '../../../domain/places-rules';
import { normalizarApifySegmentos, termosApify } from '../../../domain/segmentos-rules';
import { BuscaCancelada, ProviderError, type BuscaParams, type FetchFn, type PlacesProvider } from './places-provider';

export interface ApifyConfig {
  enabled: boolean;
  /** Segredo. Só vai no cabeçalho `Authorization`; nunca em URL, log nem mensagem de erro. */
  token: string;
  actorId: string;
  fetch: FetchFn;
  baseUrl?: string;
  timeoutMs?: number;
}

/** Termos de busca em pt-BR enviados ao actor do Google Maps. */
const TERMO: Record<TipoLugar, string> = {
  bar: 'bar',
  restaurante: 'restaurante',
  lanchonete: 'lanchonete',
  padaria: 'padaria',
  cafe: 'cafeteria',
};

/**
 * Apify (`compass~crawler-google-places`), atrás de flag. Inerte sem
 * `APIFY_ENABLED=true` e `APIFY_TOKEN`. Usa `run-sync-get-dataset-items`
 * (uma chamada, o Apify corta em ~5 min). O teto de lugares é decidido pelo
 * serviço (`limiteApify`) e repassado em `limite`.
 */
export class ApifyProvider implements PlacesProvider {
  readonly id = 'apify' as const;

  constructor(private readonly cfg: ApifyConfig) {}

  disponivel(): boolean {
    return this.cfg.enabled && this.cfg.token.trim().length > 0;
  }

  async buscar(p: BuscaParams): Promise<LugarNormalizado[]> {
    if (!this.disponivel()) {
      throw new ProviderError('A fonte Apify não está ligada neste servidor.', 'apify indisponível');
    }
    const base = this.cfg.baseUrl ?? 'https://api.apify.com';
    const url = `${base}/v2/acts/${encodeURIComponent(this.cfg.actorId)}/run-sync-get-dataset-items`;
    const termos = p.segmentos ? termosApify(p.segmentos) : p.types.map((t) => TERMO[t]);
    const input = {
      searchStringsArray: termos,
      customGeolocation: { type: 'Circle', coordinates: [p.centro.lng, p.centro.lat], radiusKm: p.raio_m / 1000 },
      maxCrawledPlacesPerSearch: Math.max(1, Math.ceil(p.limite / Math.max(1, termos.length))),
      language: 'pt-BR',
      skipClosedPlaces: false,
    };

    const limite = new AbortController();
    const timer = setTimeout(() => limite.abort(), this.cfg.timeoutMs ?? 330_000);
    const aoCancelar = () => limite.abort();
    p.signal.addEventListener('abort', aoCancelar, { once: true });
    try {
      const resp = await this.cfg.fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.cfg.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
        signal: limite.signal,
      });
      if (!resp.ok) {
        throw new ProviderError(
          resp.status === 401 || resp.status === 403
            ? 'O Apify recusou o acesso. Confira o token no servidor.'
            : 'A busca não funcionou agora. Nada foi cobrado.',
          `apify HTTP ${resp.status}`,
        );
      }
      const json = await resp.json();
      const itens = p.segmentos ? normalizarApifySegmentos(json, p.segmentos) : normalizarApify(json);
      const lugares = itens.slice(0, p.limite);
      p.onProgress?.(lugares.length);
      return lugares;
    } catch (e) {
      if (e instanceof ProviderError) throw e;
      if (p.signal.aborted) throw new BuscaCancelada();
      // Nunca repassar `e.message`: erros de fetch podem trazer a URL.
      throw new ProviderError(
        'A busca não funcionou agora. Nada foi cobrado.',
        limite.signal.aborted ? 'apify timeout' : 'apify falha de rede',
      );
    } finally {
      clearTimeout(timer);
      p.signal.removeEventListener('abort', aoCancelar);
    }
  }
}
