import { OverpassProvider } from '../providers/overpass.provider';
import { BuscaCancelada, ProviderError, type FetchFn } from '../providers/places-provider';

// Nenhum teste aqui faz rede: `fetch` e `sleep` são fakes.
const URL_FAKE = 'https://overpass.exemplo.test/api/interpreter';
const UA = 'praca-freela/1.0 (contato: teste@exemplo.test)';
const centro = { lat: -23.6003, lng: -46.665 };

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

const NODE = { elements: [{ type: 'node', id: 1, lat: -23.6, lon: -46.66, tags: { name: 'Bar do Chico', amenity: 'bar' } }] };

function setup(respostas: (Response | Error)[], over: Partial<ConstructorParameters<typeof OverpassProvider>[0]> = {}) {
  const fila = [...respostas];
  const fetch = jest.fn<ReturnType<FetchFn>, Parameters<FetchFn>>(async () => {
    const r = fila.shift();
    if (!r) throw new Error('fetch chamado além do previsto');
    if (r instanceof Error) throw r;
    return r;
  });
  const sleep = jest.fn(async (_ms: number, _signal?: AbortSignal) => undefined);
  const provider = new OverpassProvider({ url: URL_FAKE, userAgent: UA, fetch, sleep, minIntervalMs: 0, ...over });
  const params = { centro, raio_m: 500, types: ['bar'] as const, limite: 301, signal: new AbortController().signal };
  return { provider, fetch, sleep, params };
}

describe('OverpassProvider', () => {
  it('POST identificado com a query no corpo; devolve lugares normalizados e avisa o progresso', async () => {
    const { provider, fetch, params } = setup([json(NODE)]);
    const onProgress = jest.fn();
    const r = await provider.buscar({ ...params, onProgress });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ name: 'Bar do Chico', source: 'osm', source_ref: 'node/1' });
    expect(onProgress).toHaveBeenCalledWith(1);
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe(URL_FAKE);
    expect((init.headers as Record<string, string>)['User-Agent']).toBe(UA);
    expect(init.method).toBe('POST');
    expect(decodeURIComponent(String(init.body))).toContain('around:500,-23.6003,-46.665');
  });

  it('resposta no teto de elementos avisa que é parcial; abaixo do teto, não', async () => {
    const muitos = { elements: Array.from({ length: 2000 }, (_, i) => ({ type: 'node', id: i, lat: -23.6, lon: -46.66, tags: { name: `N${i}`, amenity: 'bar' } })) };
    const a = setup([json(muitos)]);
    const onParcial = jest.fn();
    expect(await a.provider.buscar({ ...a.params, onParcial })).toHaveLength(2000);
    expect(onParcial).toHaveBeenCalledTimes(1);
    const b = setup([json(NODE)]);
    const naoParcial = jest.fn();
    await b.provider.buscar({ ...b.params, onParcial: naoParcial });
    expect(naoParcial).not.toHaveBeenCalled();
  });

  it('429 espera e tenta de novo; Retry-After do servidor manda (com teto de 60 s)', async () => {
    const { provider, fetch, sleep, params } = setup([json({}, 429, { 'retry-after': '7' }), json({}, 429, { 'retry-after': '999' }), json(NODE)]);
    await provider.buscar(params);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([7000, 60000]);
  });

  it('504 sem Retry-After usa a escada 5 s, 15 s, 30 s e depois desiste com mensagem "nada foi cobrado"', async () => {
    const { provider, fetch, sleep, params } = setup([json({}, 504), json({}, 504), json({}, 504), json({}, 504)]);
    await expect(provider.buscar(params)).rejects.toMatchObject({
      name: 'ProviderError',
      userMessage: 'A busca não funcionou agora. Nada foi cobrado.',
    });
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([5000, 15000, 30000]);
  });

  it('erro 4xx (query recusada) não repete', async () => {
    const { provider, fetch, params } = setup([json({}, 400)]);
    await expect(provider.buscar(params)).rejects.toBeInstanceOf(ProviderError);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('200 com remark de estouro de tempo é tratado como indisponibilidade passageira', async () => {
    const { provider, fetch, params } = setup([json({ elements: [], remark: 'runtime error: Query timed out in "query" at line 3' }), json(NODE)]);
    expect(await provider.buscar(params)).toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('falha de rede também tenta de novo', async () => {
    const { provider, params } = setup([new TypeError('fetch failed'), json(NODE)]);
    expect(await provider.buscar(params)).toHaveLength(1);
  });

  it('guarda o intervalo mínimo entre requisições', async () => {
    let agora = 1_000_000;
    const { provider, sleep, params } = setup([json(NODE), json(NODE)], { minIntervalMs: 2000, agora: () => agora });
    await provider.buscar(params);
    expect(sleep).not.toHaveBeenCalled();
    agora += 500;
    await provider.buscar(params);
    expect(sleep.mock.calls[0]![0]).toBe(1500);
  });

  it('cancelar durante a requisição vira BuscaCancelada (sem repetir)', async () => {
    const ac = new AbortController();
    const { provider, fetch, params } = setup([new Error('abortado')]);
    fetch.mockImplementationOnce(async () => {
      ac.abort();
      throw new Error('abortado');
    });
    await expect(provider.buscar({ ...params, signal: ac.signal })).rejects.toBeInstanceOf(BuscaCancelada);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
