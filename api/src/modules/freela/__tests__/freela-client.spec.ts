import { BadGatewayException, ServiceUnavailableException } from '@nestjs/common';
import { FreelaClient, FreelaHttpError } from '../freela-client';

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

describe('FreelaClient — status do Freela na recusa', () => {
  beforeEach(configurar);

  it('409 vira FreelaHttpError com freelaStatus, sem mudar o corpo do erro que a tela vê', async () => {
    fetchMock
      .mockResolvedValueOnce(LOGIN_OK)
      .mockResolvedValueOnce(resp(409, { error: { code: 'CONFLICT', message: 'Já existe um consultor com este e-mail.' } }));

    const erro = await new FreelaClient()
      .request('POST', '/v1/admins/consultants', { name: 'Ana' })
      .catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(FreelaHttpError);
    expect(erro).toBeInstanceOf(BadGatewayException);
    expect((erro as FreelaHttpError).freelaStatus).toBe(409);
    expect((erro as FreelaHttpError).getResponse()).toEqual({
      code: 'FREELA_ERROR',
      message: 'Já existe um consultor com este e-mail.',
    });
  });
});

describe('FreelaClient — cadastro assistido (§26)', () => {
  beforeEach(configurar);
  const LINK = 'https://freela.example/primeiro-acesso?t=TOKENSECRETOAAAAAAAAAAAAAAAAAAAA123';
  const CORPO = {
    clientId: '11111111-1111-4111-8111-111111111111',
    persona: 'contractor' as const,
    accessMode: 'setup_link' as const,
    companyName: 'Padaria',
    contactName: 'Marcos',
    phone: '+5511987654321',
    address: { city: 'São Paulo', uf: 'SP' },
  };
  const CRIADO = { userId: 'u1', contractorId: 'c1', created: true, accessMode: 'setup_link', setupLink: LINK, setupLinkExpiresAt: '2026-10-21T15:00:00.000Z', activatedAt: null };

  it('createCompanyRegistration: POST no caminho do consultor e devolve o dado validado', async () => {
    fetchMock.mockResolvedValueOnce(LOGIN_OK).mockResolvedValueOnce(resp(201, { data: CRIADO }));
    const r = await new FreelaClient().createCompanyRegistration('fc/1', CORPO);
    expect(r).toMatchObject({ userId: 'u1', created: true, setupLink: LINK });
    expect(fetchMock.mock.calls[1]![0]).toBe(`${BASE}/v1/admins/consultants/fc%2F1/registrations`);
    expect(JSON.parse((fetchMock.mock.calls[1]![1] as RequestInit).body as string)).toEqual(CORPO);
  });

  it('replay: created:false aceita setupLink nulo', async () => {
    fetchMock.mockResolvedValueOnce(LOGIN_OK).mockResolvedValueOnce(resp(200, { data: { ...CRIADO, created: false, setupLink: null } }));
    expect((await new FreelaClient().createCompanyRegistration('fc', CORPO)).setupLink).toBeNull();
  });

  it('resposta fora do formato: FREELA_ERROR de mensagem fixa, sem o link nem o corpo', async () => {
    fetchMock.mockResolvedValueOnce(LOGIN_OK).mockResolvedValueOnce(resp(201, { data: { userId: 5, setupLink: LINK } }));
    const erro = (await new FreelaClient().createCompanyRegistration('fc', CORPO).catch((e: unknown) => e)) as BadGatewayException;
    expect(erro).toBeInstanceOf(BadGatewayException);
    expect(JSON.stringify(erro.getResponse())).not.toContain('TOKENSECRETO');
    expect(erro.getResponse()).toEqual({ code: 'FREELA_ERROR', message: 'O Freela respondeu fora do formato esperado.' });
  });

  it('409 guarda só code e alreadyLinkedToThisConsultant do Freela', async () => {
    fetchMock.mockResolvedValueOnce(LOGIN_OK).mockResolvedValueOnce(
      resp(409, { error: { code: 'PHONE_ALREADY_REGISTERED', message: 'Telefone já existe', alreadyLinkedToThisConsultant: true, userId: 'vazou' } }),
    );
    const erro = (await new FreelaClient().createCompanyRegistration('fc', CORPO).catch((e: unknown) => e)) as FreelaHttpError;
    expect(erro.freelaStatus).toBe(409);
    expect(erro.freelaError).toEqual({ code: 'PHONE_ALREADY_REGISTERED', alreadyLinkedToThisConsultant: true });
  });

  it('reissueRegistrationLink: valida link e validade', async () => {
    fetchMock.mockResolvedValueOnce(LOGIN_OK).mockResolvedValueOnce(resp(200, { data: { userId: 'u1', setupLink: LINK, setupLinkExpiresAt: '2026-10-22T15:00:00.000Z' } }));
    const r = await new FreelaClient().reissueRegistrationLink('fc', 'u1', 'perdeu');
    expect(r.setupLink).toBe(LINK);
    expect(fetchMock.mock.calls[1]![0]).toBe(`${BASE}/v1/admins/consultants/fc/registrations/u1/reissue-link`);
    expect(JSON.parse((fetchMock.mock.calls[1]![1] as RequestInit).body as string)).toEqual({ reason: 'perdeu' });
  });

  it('listRegistrations: filtros na query e nextCursor de meta', async () => {
    const item = { userId: 'u1', contractorId: 'c1', persona: 'contractor', companyName: 'P', cnpj: null, phone: '+55', email: null, source: 'on_behalf', accessMode: 'setup_link', createdAt: '2026-10-19T14:00:00.000Z', activatedAt: null, firstVacancyAt: null, firstJobCompletedAt: null, status: 'pending' };
    fetchMock.mockResolvedValueOnce(LOGIN_OK).mockResolvedValueOnce(resp(200, { data: [item], meta: { nextCursor: 'abc' } }));
    const r = await new FreelaClient().listRegistrations('fc', { status: 'pending', limit: 50 });
    expect(r.nextCursor).toBe('abc');
    expect(r.data[0]!.status).toBe('pending');
    expect(fetchMock.mock.calls[1]![0]).toBe(`${BASE}/v1/admins/consultants/fc/registrations?status=pending&limit=50`);
  });

  it('listRegistrations: status desconhecido quebra a validação (não passa lixo adiante)', async () => {
    fetchMock.mockResolvedValueOnce(LOGIN_OK).mockResolvedValueOnce(resp(200, { data: [{ userId: 'u', companyName: 'x', source: 's', createdAt: 'd', status: 'zzz' }], meta: {} }));
    await expect(new FreelaClient().listRegistrations('fc')).rejects.toBeInstanceOf(BadGatewayException);
  });
});

describe('FreelaClient — cupons e busca de contratante (§38.7)', () => {
  beforeEach(configurar);
  const CUPOM = {
    id: 'c1', code: 'PRACA-ABCDEFGHIJ', discountType: 'PERCENT', percentOff: 100, amountOffInCents: null, contractorUserId: 'u1',
    singleUse: true, active: true, expiresAt: '2026-11-22T02:59:59.000Z', redeemedAt: null, redeemedVacancyId: null, minJobHours: null,
    createdAt: '2026-10-22T12:00:00.000Z', updatedAt: '2026-10-22T12:00:00.000Z',
  };

  it('createCoupon: POST /v1/admin/coupons com o corpo, resposta { data } validada com zod', async () => {
    fetchMock.mockResolvedValueOnce(LOGIN_OK).mockResolvedValueOnce(resp(201, { data: CUPOM }));
    const c = await new FreelaClient().createCoupon({ code: 'PRACA-ABCDEFGHIJ', discountType: 'PERCENT', percentOff: 100, contractorUserId: 'u1', singleUse: true });
    expect(c).toEqual({ id: 'c1', code: 'PRACA-ABCDEFGHIJ', discountType: 'PERCENT', percentOff: 100, amountOffInCents: null, contractorUserId: 'u1', singleUse: true, active: true, expiresAt: '2026-11-22T02:59:59.000Z', redeemedAt: null });
    const [url, init] = fetchMock.mock.calls[1]!;
    expect(url).toBe(`${BASE}/v1/admin/coupons`);
    expect((init as RequestInit).method).toBe('POST');
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ code: 'PRACA-ABCDEFGHIJ', discountType: 'PERCENT', percentOff: 100, contractorUserId: 'u1', singleUse: true });
  });

  it('código repetido = FreelaHttpError 400 com freelaError.code COUPON_CODE_TAKEN', async () => {
    fetchMock.mockResolvedValueOnce(LOGIN_OK).mockResolvedValueOnce(resp(400, { error: { code: 'COUPON_CODE_TAKEN', message: 'Código já existe.' } }));
    const e = await new FreelaClient().createCoupon({ code: 'X', discountType: 'PERCENT', percentOff: 100, contractorUserId: 'u1', singleUse: true }).catch((x) => x);
    expect(e).toBeInstanceOf(FreelaHttpError);
    expect(e).toMatchObject({ freelaStatus: 400, freelaError: { code: 'COUPON_CODE_TAKEN' } });
  });

  it('resposta fora do formato = FREELA_ERROR de mensagem fixa', async () => {
    fetchMock.mockResolvedValueOnce(LOGIN_OK).mockResolvedValueOnce(resp(201, { data: { id: 1 } }));
    await expect(new FreelaClient().createCoupon({ code: 'X', discountType: 'PERCENT', percentOff: 100, contractorUserId: 'u1', singleUse: true })).rejects.toMatchObject({
      response: { code: 'FREELA_ERROR', message: 'O Freela respondeu fora do formato esperado.' },
    });
  });

  it('listCoupons, updateCoupon e searchContractors', async () => {
    fetchMock
      .mockResolvedValueOnce(LOGIN_OK)
      .mockResolvedValueOnce(resp(200, { data: [CUPOM] }))
      .mockResolvedValueOnce(resp(200, { data: { ...CUPOM, active: false } }))
      .mockResolvedValueOnce(resp(200, { data: [{ userId: 'u1', name: 'Bom Pão', city: null, module: 'bars-restaurants' }] }));
    const client = new FreelaClient();
    expect((await client.listCoupons())[0]!.code).toBe('PRACA-ABCDEFGHIJ');
    expect((await client.updateCoupon('c1', { active: false })).active).toBe(false);
    expect(await client.searchContractors('Bom Pão & Cia')).toEqual([{ userId: 'u1', name: 'Bom Pão', city: null, module: 'bars-restaurants' }]);
    expect(fetchMock.mock.calls[2]![0]).toBe(`${BASE}/v1/admin/coupons/c1`);
    expect((fetchMock.mock.calls[2]![1] as RequestInit).method).toBe('PATCH');
    expect(fetchMock.mock.calls[3]![0]).toBe(`${BASE}/v1/admin/crm/contractors/search?q=Bom%20P%C3%A3o%20%26%20Cia`);
  });
});
