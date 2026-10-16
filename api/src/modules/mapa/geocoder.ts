/**
 * Provedores de geocodificação (contrato §21.2). Uma porta só, `buscar`, que
 * devolve a coordenada, `null` quando o endereço não existe, ou lança
 * `GeocoderIndisponivel` quando o problema é do provedor (rede, limite) — aí
 * o lead fica `pendente` e a rodada para.
 */
export interface Coordenada {
  lat: number;
  lng: number;
}

export interface Geocoder {
  readonly nome: 'nominatim' | 'google' | 'off';
  /** Espera mínima entre duas consultas (política do provedor). */
  readonly intervaloMs: number;
  buscar(consulta: string): Promise<Coordenada | null>;
}

export class GeocoderIndisponivel extends Error {}

export const GEOCODER = Symbol('GEOCODER');

type Fetch = typeof fetch;

const TIMEOUT_MS = 10_000;

async function pedir(f: Fetch, url: string, headers: Record<string, string>): Promise<unknown> {
  let r: Response;
  try {
    r = await f(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (e) {
    throw new GeocoderIndisponivel(`sem resposta: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (r.status === 429 || r.status >= 500) throw new GeocoderIndisponivel(`HTTP ${r.status}`);
  if (!r.ok) throw new GeocoderIndisponivel(`HTTP ${r.status}`);
  return r.json();
}

/** OpenStreetMap — grátis, no máximo 1 consulta por segundo, User-Agent identificado. */
export function nominatim(userAgent: string, f: Fetch = fetch): Geocoder {
  return {
    nome: 'nominatim',
    intervaloMs: 1100,
    async buscar(consulta) {
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=br&q=${encodeURIComponent(consulta)}`;
      const corpo = (await pedir(f, url, { 'User-Agent': userAgent, 'Accept-Language': 'pt-BR' })) as {
        lat?: string;
        lon?: string;
      }[];
      const hit = Array.isArray(corpo) ? corpo[0] : undefined;
      if (!hit?.lat || !hit.lon) return null;
      return { lat: Number(hit.lat), lng: Number(hit.lon) };
    },
  };
}

/** Google Geocoding API — pago por consulta; `ZERO_RESULTS` = não achou. */
export function google(apiKey: string, f: Fetch = fetch): Geocoder {
  return {
    nome: 'google',
    intervaloMs: 50,
    async buscar(consulta) {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?region=br&language=pt-BR&address=${encodeURIComponent(consulta)}&key=${encodeURIComponent(apiKey)}`;
      const corpo = (await pedir(f, url, {})) as {
        status?: string;
        results?: { geometry?: { location?: { lat: number; lng: number } } }[];
      };
      if (corpo.status === 'ZERO_RESULTS') return null;
      if (corpo.status !== 'OK') throw new GeocoderIndisponivel(`Google: ${corpo.status ?? 'sem status'}`);
      const loc = corpo.results?.[0]?.geometry?.location;
      return loc ? { lat: loc.lat, lng: loc.lng } : null;
    },
  };
}

export const desligado: Geocoder = {
  nome: 'off',
  intervaloMs: 0,
  async buscar() {
    throw new GeocoderIndisponivel('geocodificação desligada (GEOCODER=off)');
  },
};

/** Escolhe pelo ambiente; `google` sem chave cai para desligado (e o log avisa). */
export function geocoderDoAmbiente(env: NodeJS.ProcessEnv = process.env): Geocoder {
  const tipo = env.GEOCODER || 'nominatim';
  if (tipo === 'off') return desligado;
  if (tipo === 'google') return env.GOOGLE_MAPS_API_KEY ? google(env.GOOGLE_MAPS_API_KEY) : desligado;
  return nominatim(env.GEOCODER_USER_AGENT || 'praca-freela/1.0');
}
