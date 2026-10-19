import { ApifyProvider } from '../providers/apify.provider';
import { ProviderError, type FetchFn } from '../providers/places-provider';

// Token de mentira, só para provar que ele não vaza. Nenhuma chamada de rede.
const TOKEN = 'token-de-teste-nao-real';
const centro = { lat: -23.6003, lng: -46.665 };
const params = { centro, raio_m: 1500, types: ['bar', 'padaria'] as const, limite: 100, signal: new AbortController().signal };
const ITENS = [
  { title: 'Café Ipê', placeId: 'p1', location: { lat: -23.6, lng: -46.66 }, categoryName: 'Cafeteria' },
  { title: 'Bar X', placeId: 'p2', location: { lat: -23.601, lng: -46.66 }, categoryName: 'Bar' },
];

const mk = (over: Partial<ConstructorParameters<typeof ApifyProvider>[0]> = {}, fetchImpl?: FetchFn) => {
  const fetch = jest.fn<ReturnType<FetchFn>, Parameters<FetchFn>>(
    fetchImpl ?? (async () => new Response(JSON.stringify(ITENS), { status: 201 })),
  );
  return { fetch, provider: new ApifyProvider({ enabled: true, token: TOKEN, actorId: 'compass~crawler-google-places', fetch, ...over }) };
};

describe('ApifyProvider — atrás de flag', () => {
  it.each([
    ['flag desligada', { enabled: false }],
    ['sem token', { token: '' }],
    ['token só com espaços', { token: '   ' }],
  ])('inerte: %s => indisponível e nunca chama a rede', async (_n, over) => {
    const { provider, fetch } = mk(over);
    expect(provider.disponivel()).toBe(false);
    await expect(provider.buscar(params)).rejects.toBeInstanceOf(ProviderError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('ligado: token só no cabeçalho Authorization (nunca na URL), círculo em km e limite repartido por termo', async () => {
    const { provider, fetch } = mk();
    expect(provider.disponivel()).toBe(true);
    const r = await provider.buscar(params);
    expect(r.map((l) => l.source_ref)).toEqual(['p1', 'p2']);
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).not.toContain(TOKEN);
    expect(url).toContain('/v2/acts/compass~crawler-google-places/run-sync-get-dataset-items');
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
    const body = JSON.parse(String(init.body));
    expect(body.searchStringsArray).toEqual(['bar', 'padaria']);
    expect(body.customGeolocation).toEqual({ type: 'Circle', coordinates: [-46.665, -23.6003], radiusKm: 1.5 });
    expect(body.maxCrawledPlacesPerSearch).toBe(50);
  });

  it('nunca devolve mais que o limite', async () => {
    const { provider } = mk();
    expect(await provider.buscar({ ...params, limite: 1 })).toHaveLength(1);
  });

  it('erro HTTP: mensagem para pessoa sem URL nem token; 401 pede conferir o token', async () => {
    for (const status of [500, 401]) {
      const { provider } = mk({}, async () => new Response('{"error":"x"}', { status }));
      const e = (await provider.buscar(params).catch((x: unknown) => x)) as ProviderError;
      expect(e).toBeInstanceOf(ProviderError);
      expect(JSON.stringify([e.message, e.userMessage, e.detalhe])).not.toContain(TOKEN);
      expect(e.userMessage).toBe(status === 401 ? 'O Apify recusou o acesso. Confira o token no servidor.' : 'A busca não funcionou agora. Nada foi cobrado.');
    }
  });

  it('exceção do fetch com o token na mensagem não vaza para erro nem log', async () => {
    const { provider } = mk({}, async () => {
      throw new TypeError(`fetch failed https://api.apify.com/x?token=${TOKEN}`);
    });
    const e = (await provider.buscar(params).catch((x: unknown) => x)) as ProviderError;
    expect(e).toBeInstanceOf(ProviderError);
    expect(JSON.stringify([e.message, e.userMessage, e.detalhe, String(e.stack).split('\n')[0]])).not.toContain(TOKEN);
  });
});
