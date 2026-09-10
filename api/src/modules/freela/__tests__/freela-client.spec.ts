import { BadGatewayException, ServiceUnavailableException } from '@nestjs/common';
import { FreelaClient } from '../freela-client';

const BASE = 'http://freela.local';

/** Resposta de `fetch` no recorte que o cliente usa (só `text()`). */
function resp(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (body === undefined ? '' : JSON.stringify(body)),
  } as unknown as Response;
}

const LOGIN_OK = resp(200, { data: { accessToken: 'tok-1', refreshToken: 'ref-1' } });
const LOGIN_OK_2 = resp(200, { data: { accessToken: 'tok-2', refreshToken: 'ref-2' } });

/** O que sobrou de `process.env` antes do teste mexer. */
const ANTES = {
  FREELA_API_URL: process.env.FREELA_API_URL,
  FREELA_ADMIN_EMAIL: process.env.FREELA_ADMIN_EMAIL,
  FREELA_ADMIN_PASSWORD: process.env.FREELA_ADMIN_PASSWORD,
};

function configurar(): void {
  process.env.FREELA_API_URL = `${BASE}/`;
  process.env.FREELA_ADMIN_EMAIL = 'praca@freela.local';
  process.env.FREELA_ADMIN_PASSWORD = 'segredo';
}

function desconfigurar(): void {
  process.env.FREELA_API_URL = '';
  process.env.FREELA_ADMIN_EMAIL = '';
  process.env.FREELA_ADMIN_PASSWORD = '';
}

let fetchMock: jest.Mock;

beforeEach(() => {
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  for (const [k, v] of Object.entries(ANTES)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

/** Cabeçalhos da n-ésima chamada de `fetch` (1 = primeira). */
function headers(n: number): Record<string, string> {
  return (fetchMock.mock.calls[n - 1]![1] as { headers: Record<string, string> }).headers;
}

describe('FreelaClient — sem conexão configurada', () => {
  beforeEach(desconfigurar);

  it('isConfigured() é false quando falta qualquer uma das três variáveis', () => {
    const client = new FreelaClient();
    expect(client.isConfigured()).toBe(false);

    configurar();
    expect(new FreelaClient().isConfigured()).toBe(true);

    process.env.FREELA_ADMIN_PASSWORD = '';
    expect(new FreelaClient().isConfigured()).toBe(false);
  });

  it('request() responde 503 FREELA_NOT_CONFIGURED sem tocar na rede', async () => {
    const client = new FreelaClient();

    await expect(client.request('GET', '/v1/admins/activation-campaigns')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(fetchMock).not.toHaveBeenCalled();

    const erro = await client.request('GET', '/x').catch((e: ServiceUnavailableException) => e);
    expect((erro as ServiceUnavailableException).getResponse()).toEqual({
      code: 'FREELA_NOT_CONFIGURED',
      message:
        'Conexão com o Freela não configurada (FREELA_API_URL, FREELA_ADMIN_EMAIL, FREELA_ADMIN_PASSWORD).',
    });
  });
});

describe('FreelaClient — login e chamada', () => {
  beforeEach(configurar);

  it('faz login na primeira chamada e manda o token no Bearer', async () => {
    fetchMock
      .mockResolvedValueOnce(LOGIN_OK)
      .mockResolvedValueOnce(resp(200, { data: [{ id: 'c1' }], meta: { schedulerEnabled: true } }));

    const client = new FreelaClient();
    const out = await client.request<{ id: string }[]>('GET', '/v1/admins/activation-campaigns');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]![0]).toBe(`${BASE}/v1/admins/login`);
    expect(fetchMock.mock.calls[1]![0]).toBe(`${BASE}/v1/admins/activation-campaigns`);
    expect(headers(2).Authorization).toBe('Bearer tok-1');
    expect(out.data).toEqual([{ id: 'c1' }]);
    expect(out.meta).toEqual({ schedulerEnabled: true });
  });

  it('guarda o token em memória: a segunda chamada não faz login de novo', async () => {
    fetchMock
      .mockResolvedValueOnce(LOGIN_OK)
      .mockResolvedValueOnce(resp(200, { data: [] }))
      .mockResolvedValueOnce(resp(200, { data: [] }));

    const client = new FreelaClient();
    await client.request('GET', '/v1/admins/activation-campaigns');
    await client.request('GET', '/v1/admins/activation-campaigns');

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('401 refaz o login UMA vez e repete a chamada com o token novo', async () => {
    fetchMock
      .mockResolvedValueOnce(LOGIN_OK)
      .mockResolvedValueOnce(resp(401, { message: 'Token expirado' }))
      .mockResolvedValueOnce(LOGIN_OK_2)
      .mockResolvedValueOnce(resp(200, { data: { id: 'c1' } }));

    const client = new FreelaClient();
    const out = await client.request<{ id: string }>('GET', '/v1/admins/activation-campaigns/c1');

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(headers(4).Authorization).toBe('Bearer tok-2');
    expect(out.data).toEqual({ id: 'c1' });
  });

  it('401 depois do relogin não vira laço infinito: cai em FREELA_ERROR', async () => {
    fetchMock
      .mockResolvedValueOnce(LOGIN_OK)
      .mockResolvedValueOnce(resp(401, { message: 'Sem permissão REFERRALS' }))
      .mockResolvedValueOnce(LOGIN_OK_2)
      .mockResolvedValueOnce(resp(401, { message: 'Sem permissão REFERRALS' }));

    const client = new FreelaClient();
    const erro = await client.request('GET', '/x').catch((e: BadGatewayException) => e);

    expect(erro).toBeInstanceOf(BadGatewayException);
    expect((erro as BadGatewayException).getResponse()).toEqual({
      code: 'FREELA_ERROR',
      message: 'Sem permissão REFERRALS',
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('erro 400 do Freela vira 502 FREELA_ERROR com a mensagem do corpo', async () => {
    fetchMock
      .mockResolvedValueOnce(LOGIN_OK)
      .mockResolvedValueOnce(
        resp(400, { error: { code: 'VALIDATION_ERROR', message: 'audience inválido.' } }),
      );

    const client = new FreelaClient();
    const erro = await client
      .request('POST', '/v1/admins/activation-campaigns', { name: 'x' })
      .catch((e: BadGatewayException) => e);

    expect(erro).toBeInstanceOf(BadGatewayException);
    expect((erro as BadGatewayException).getResponse()).toEqual({
      code: 'FREELA_ERROR',
      message: 'audience inválido.',
    });
  });

  it('erro sem mensagem no corpo cita o status HTTP', async () => {
    fetchMock.mockResolvedValueOnce(LOGIN_OK).mockResolvedValueOnce(resp(500, undefined));

    const client = new FreelaClient();
    const erro = await client.request('GET', '/x').catch((e: BadGatewayException) => e);

    expect((erro as BadGatewayException).getResponse()).toEqual({
      code: 'FREELA_ERROR',
      message: 'O Freela respondeu HTTP 500.',
    });
  });

  it('login recusado vira FREELA_ERROR com a mensagem do Freela', async () => {
    fetchMock.mockResolvedValueOnce(resp(401, { message: 'Credenciais inválidas' }));

    const client = new FreelaClient();
    const erro = await client.request('GET', '/x').catch((e: BadGatewayException) => e);

    expect(erro).toBeInstanceOf(BadGatewayException);
    expect((erro as BadGatewayException).getResponse()).toEqual({
      code: 'FREELA_ERROR',
      message: 'Credenciais inválidas',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('tempo esgotado vira 502 FREELA_UNREACHABLE', async () => {
    fetchMock
      .mockResolvedValueOnce(LOGIN_OK)
      .mockRejectedValueOnce(Object.assign(new Error('This operation was aborted'), { name: 'AbortError' }));

    const client = new FreelaClient();
    const erro = await client.request('GET', '/x').catch((e: BadGatewayException) => e);

    expect(erro).toBeInstanceOf(BadGatewayException);
    expect((erro as BadGatewayException).getResponse()).toEqual({
      code: 'FREELA_UNREACHABLE',
      message: 'O Freela não respondeu em 15 s.',
    });
  });

  it('rede fora vira 502 FREELA_UNREACHABLE com o motivo', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));

    const client = new FreelaClient();
    const erro = await client.request('GET', '/x').catch((e: BadGatewayException) => e);

    expect(erro).toBeInstanceOf(BadGatewayException);
    expect((erro as BadGatewayException).getResponse()).toEqual({
      code: 'FREELA_UNREACHABLE',
      message: 'Não foi possível falar com o Freela: fetch failed.',
    });
  });

  it('resposta que não é JSON não vira 500: vira FREELA_ERROR', async () => {
    fetchMock.mockResolvedValueOnce(LOGIN_OK).mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => '<html>502 Bad Gateway</html>',
    } as unknown as Response);

    const client = new FreelaClient();
    const erro = await client.request('GET', '/x').catch((e: BadGatewayException) => e);

    expect(erro).toBeInstanceOf(BadGatewayException);
    expect((erro as BadGatewayException).getResponse()).toMatchObject({ code: 'FREELA_ERROR' });
  });

  it('manda o corpo em JSON e a URL montada sem barra dobrada', async () => {
    fetchMock.mockResolvedValueOnce(LOGIN_OK).mockResolvedValueOnce(resp(201, { data: { id: 'c9' } }));

    const client = new FreelaClient();
    await client.request('POST', '/v1/admins/activation-campaigns', { name: 'Campanha' });

    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe(`${BASE}/v1/admins/activation-campaigns`);
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ name: 'Campanha' }));
    expect(headers(2)['Content-Type']).toBe('application/json');
  });

  it('multipart vai como FormData, sem Content-Type na mão', async () => {
    fetchMock
      .mockResolvedValueOnce(LOGIN_OK)
      .mockResolvedValueOnce(resp(201, { data: { key: 'k', url: 'u' } }));

    const client = new FreelaClient();
    await client.request('POST', '/v1/admins/campaign-templates/upload', undefined, {
      field: 'file',
      filename: 'banner.png',
      mimetype: 'image/png',
      buffer: Buffer.from([1, 2, 3]),
    });

    const init = fetchMock.mock.calls[1]![1] as RequestInit;
    expect(init.body).toBeInstanceOf(FormData);
    expect(headers(2)['Content-Type']).toBeUndefined();
    expect(headers(2).Authorization).toBe('Bearer tok-1');
  });
});
