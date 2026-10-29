import { BadGatewayException } from '@nestjs/common';
import { FreelaClient } from '../freela-client';
import { achatarQuadro } from '../freela-pipeline';

const BASE = 'http://freela.local';

function resp(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (body === undefined ? '' : JSON.stringify(body)),
  } as unknown as Response;
}

const ANTES = {
  FREELA_API_URL: process.env.FREELA_API_URL,
  FREELA_ADMIN_EMAIL: process.env.FREELA_ADMIN_EMAIL,
  FREELA_ADMIN_PASSWORD: process.env.FREELA_ADMIN_PASSWORD,
};

let fetchMock: jest.Mock;

beforeEach(() => {
  process.env.FREELA_API_URL = BASE;
  process.env.FREELA_ADMIN_EMAIL = 'praca@freela.local';
  process.env.FREELA_ADMIN_PASSWORD = 'segredo';
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  for (const [k, v] of Object.entries(ANTES)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

const card = (userId: string, extra: Record<string, unknown> = {}) => ({
  userId,
  name: `Empresa ${userId}`,
  modules: ['bars-restaurants'],
  state: 'SP',
  city: 'Jundiaí',
  segment: 'Bar',
  whatsappPhone: '11999990000',
  hiringsCount: 0,
  registeredAt: '2026-10-01T12:00:00.000Z',
  lastMessageSentAt: null,
  messagesSentCount: 0,
  ...extra,
});

describe('FreelaClient.quadroDeContratantes', () => {
  it('achata as colunas do envelope em cartões, ignorando campos a mais', async () => {
    fetchMock
      .mockResolvedValueOnce(resp(200, { data: { accessToken: 'tok' } }))
      .mockResolvedValueOnce(
        resp(200, {
          data: {
            columns: [
              { stage: 'CADASTRO_NOVO', title: 'Cadastro novo', count: 2, cards: [card('u1'), card('u2')] },
              { stage: 'PRIMEIRA_CONTRATACAO', title: '1ª', count: 1, cards: [card('u3', { hiringsCount: 1 })] },
            ],
            totalContractors: 3,
          },
        }),
      );

    const cartoes = await new FreelaClient().quadroDeContratantes();

    expect(cartoes.map((c) => c.userId)).toEqual(['u1', 'u2', 'u3']);
    expect(cartoes[2]).toEqual({
      userId: 'u3',
      name: 'Empresa u3',
      city: 'Jundiaí',
      state: 'SP',
      whatsappPhone: '11999990000',
      hiringsCount: 1,
      registeredAt: '2026-10-01T12:00:00.000Z',
    });
    const [url, init] = fetchMock.mock.calls[1]!;
    expect(url).toBe(`${BASE}/v1/admin/crm/pipeline`);
    expect(init.method).toBe('GET');
  });

  it('cartão sem whatsappPhone (ou com null) vira null', async () => {
    const { whatsappPhone: _w, ...semTelefone } = card('u1');
    fetchMock
      .mockResolvedValueOnce(resp(200, { data: { accessToken: 'tok' } }))
      .mockResolvedValueOnce(
        resp(200, { data: { columns: [{ stage: 'X', cards: [semTelefone, card('u2', { whatsappPhone: null, city: null })] }] } }),
      );

    const cartoes = await new FreelaClient().quadroDeContratantes();

    expect(cartoes[0]!.whatsappPhone).toBeNull();
    expect(cartoes[1]!.whatsappPhone).toBeNull();
    expect(cartoes[1]!.city).toBeNull();
  });

  it('data fora do formato → FREELA_ERROR de mensagem fixa, sem ecoar o corpo', async () => {
    fetchMock
      .mockResolvedValueOnce(resp(200, { data: { accessToken: 'tok' } }))
      .mockResolvedValueOnce(resp(200, { data: { columns: 'SEGREDO-NO-CORPO' } }));

    const erro = await new FreelaClient().quadroDeContratantes().catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(BadGatewayException);
    const corpo = (erro as BadGatewayException).getResponse() as { code: string; message: string };
    expect(corpo.code).toBe('FREELA_ERROR');
    expect(corpo.message).toBe('O Freela respondeu fora do formato esperado.');
    expect(JSON.stringify(corpo)).not.toContain('SEGREDO');
  });
});

describe('achatarQuadro', () => {
  it('lança em formato inválido', () => {
    expect(() => achatarQuadro({ columns: [{ stage: 'X', cards: [{ userId: 'u' }] }] })).toThrow();
  });
});
