import { DEFAULT_TEMPLATE_DEFAULTS } from '../../../domain/catalog/messages';
import type { PrismaService } from '../../../common/database/prisma.service';
import type { DisparosService } from '../../disparos/disparos.service';
import type { MessagesService, SettingsView } from '../../messages/messages.service';
import { FreelaCampaignsService } from '../freela-campaigns.service';
import { FreelaClient } from '../freela-client';
import { FreelaOutboxService } from '../freela-outbox.service';

const SETTINGS: SettingsView = {
  mode: 'freela',
  window_start: 9,
  window_end: 19,
  sunday: false,
  daily_limit: 200,
  gap_min: 20,
  gap_max: 90,
  daily_quota: 20,
  template_defaults: DEFAULT_TEMPLATE_DEFAULTS,
};

const PRACA = '11111111-1111-4111-8111-111111111111';
const DISPARO = '22222222-2222-4222-8222-222222222222';
const DIEGO = '33333333-3333-4333-8333-333333333333';

/** Um `msg_sends` em modo `freela`, do jeito que o outbox lê (com o lead). */
function send(n: number, over: Partial<ReturnType<typeof baseSend>> = {}) {
  return { ...baseSend(n), ...over };
}

function baseSend(n: number) {
  return {
    id: `send-${n}`,
    disparo_id: DISPARO as string | null,
    cadence_id: null as string | null,
    lead_id: `lead-${n}`,
    text: `Oi Chefe${n}, tudo bem?`,
    lead: {
      id: `lead-${n}`,
      name: `Casa ${n}`,
      decisor: `Chefe${n} Teste`,
      phone: `(31) 9999-000${n}`,
      city: 'Belo Horizonte',
    },
  };
}

/** Prisma de mentira: `$transaction` roda o callback com o próprio objeto. */
function fakePrisma() {
  const p = {
    $executeRaw: jest.fn().mockResolvedValue(0),
    $transaction: jest.fn(),
    msg_sends: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      count: jest.fn().mockResolvedValue(0),
    },
    msg_templates: {
      findUnique: jest.fn().mockResolvedValue({
        name: 'Contratante · toque 1',
        text_a: 'Oi {{primeiro_nome_dono}}, sou {{meu_nome}}. E o {{estabelecimento}} em {{cidade}}?',
        text_b: null,
      }),
    },
    disparos: {
      findUnique: jest.fn().mockResolvedValue({
        id: DISPARO,
        name: 'Toque 1 · 09/09/2026',
        by: DIEGO,
        split: false,
        template_id: 'tpl-1',
        filters: { praca_id: PRACA },
        status: 'agendado',
      }),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    pracas: {
      findUnique: jest.fn().mockResolvedValue({
        name: 'BH · Setembro',
        start_date: '2026-09-14',
        city: 'Belo Horizonte',
        cobertura_cidade: 'Belo Horizonte',
      }),
    },
    users: {
      findUnique: jest.fn().mockResolvedValue({ name: 'Diego Souza' }),
      findFirst: jest.fn().mockResolvedValue({ id: DIEGO }),
    },
    freela_campaigns: {
      create: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  p.$transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(p));
  return p;
}

type Fake = ReturnType<typeof fakePrisma>;

/** Cliente do Freela de mentira: cria a campanha `fc-1` e aceita o start. */
function fakeClient(over?: (method: string, path: string) => unknown) {
  const request = jest.fn().mockImplementation(async (method: string, path: string) => {
    const custom = over?.(method, path);
    if (custom !== undefined) return custom;
    if (method === 'POST' && path === '/v1/admins/activation-campaigns') {
      return { data: { id: 'fc-1', status: 'DRAFT' } };
    }
    if (method === 'PATCH') return { data: { id: 'fc-1', status: 'RUNNING' } };
    return { data: null };
  });
  return {
    request,
    isConfigured: () => true,
    ensureConfigured: () => undefined,
    perContactMessage: () => false,
  } as unknown as FreelaClient & { request: jest.Mock };
}

function montar(p: Fake, client: FreelaClient) {
  const messages = { getSettings: jest.fn().mockResolvedValue(SETTINGS) } as unknown as MessagesService;
  const campanhas = new FreelaCampaignsService(
    p as unknown as PrismaService,
    client,
    {} as unknown as DisparosService,
    messages,
  );
  return new FreelaOutboxService(p as unknown as PrismaService, client, campanhas, messages);
}

/** Primeiro `updateMany` de `msg_sends` que casa com o campo pedido. */
function updates(p: Fake): Record<string, unknown>[] {
  return p.msg_sends.updateMany.mock.calls.map((c) => c[0] as Record<string, unknown>);
}

describe('FreelaOutboxService.flush — lote de disparo', () => {
  it('3 envios de um disparo viram UMA campanha e recebem o freela_campaign_id', async () => {
    const p = fakePrisma();
    p.msg_sends.findMany.mockResolvedValue([send(1), send(2), send(3)]);
    const client = fakeClient();

    const out = await montar(p, client).flush(new Date('2026-09-09T12:00:00Z'));

    expect(out).toEqual({ campaigns: 1, sends: 3, failed: 0 });

    const criacoes = client.request.mock.calls.filter(
      (c) => c[0] === 'POST' && c[1] === '/v1/admins/activation-campaigns',
    );
    expect(criacoes).toHaveLength(1);
    const body = criacoes[0]![2] as Record<string, unknown>;
    expect(body.audience).toBe('EXTERNAL_LIST');
    expect(body.name).toBe('Toque 1 · 09/09/2026');
    expect(body.listFileName).toBe('praca:disparo');
    expect(body.skipRegistered).toBe(false);
    expect(body.contacts).toEqual([
      { name: 'Chefe1 Teste', phone: '+553199990001' },
      { name: 'Chefe2 Teste', phone: '+553199990002' },
      { name: 'Chefe3 Teste', phone: '+553199990003' },
    ]);
    // Modelo convertido, não o texto já renderizado de um dos leads.
    expect(body.whatsappTemplate).toContain('{{primeiro_nome}}');
    expect(body.whatsappTemplate).toContain('Diego');
    // `{{cidade}}` vira a cidade-sede da praça do filtro: em lista externa o
    // Freela não sabe a cidade do contato.
    expect(body.whatsappTemplate).toContain('em Belo Horizonte?');
    expect(body.whatsappTemplate).not.toContain('{{cidade}}');
    // Ritmo do Praça.
    expect(body.messagesPerHour).toBe(60);
    expect(body.dailyCap).toBe(200);
    expect(body.windowStartHour).toBe(9);
    expect(body.windowEndHour).toBe(19);
    expect(body.weekdaysOnly).toBe(true);

    // Nasce DRAFT e o outbox manda começar na hora.
    expect(client.request.mock.calls).toContainEqual(['PATCH', '/v1/admins/activation-campaigns/fc-1/start']);

    expect(p.freela_campaigns.create).toHaveBeenCalledTimes(1);
    expect(p.freela_campaigns.create.mock.calls[0]![0]).toMatchObject({
      data: expect.objectContaining({
        freela_id: 'fc-1',
        kind: 'disparo',
        disparo_id: DISPARO,
        praca_id: PRACA,
        audience: 'EXTERNAL_LIST',
        status: 'DRAFT',
        created_by: DIEGO,
      }),
    });
    // Espelho gravado ANTES do start (com o status de nascimento) e o status de
    // verdade escrito depois — sem essa ordem, o start falhando deixaria a
    // campanha sem espelho e a próxima rodada criaria outra igual.
    expect(p.freela_campaigns.update.mock.calls[0]![0]).toMatchObject({
      where: { freela_id: 'fc-1' },
      data: expect.objectContaining({ status: 'RUNNING' }),
    });

    expect(updates(p)).toContainEqual({
      where: { id: { in: ['send-1', 'send-2', 'send-3'] } },
      data: { freela_campaign_id: 'fc-1' },
    });
    expect(p.disparos.update).toHaveBeenCalledWith({
      where: { id: DISPARO },
      data: { freela_campaign_id: 'fc-1' },
    });
  });

  it('telefone inválido vira falhou e não vai para o Freela', async () => {
    const p = fakePrisma();
    p.msg_sends.findMany.mockResolvedValue([
      send(1),
      send(2, { lead: { ...baseSend(2).lead, phone: '123' } }),
    ]);
    const client = fakeClient();

    const out = await montar(p, client).flush(new Date('2026-09-09T12:00:00Z'));

    expect(out).toEqual({ campaigns: 1, sends: 1, failed: 1 });
    expect(updates(p)).toContainEqual({
      where: { id: { in: ['send-2'] } },
      data: { status: 'falhou', failure_reason: 'Telefone inválido para WhatsApp.' },
    });
    const body = client.request.mock.calls[0]![2] as { contacts: unknown[] };
    expect(body.contacts).toEqual([{ name: 'Chefe1 Teste', phone: '+553199990001' }]);
  });

  it('telefone repetido no lote vira falhou (o Freela descarta o segundo)', async () => {
    const p = fakePrisma();
    p.msg_sends.findMany.mockResolvedValue([
      send(1),
      send(2, { lead: { ...baseSend(2).lead, phone: '(31) 9999-0001' } }),
      send(3),
    ]);
    const client = fakeClient();

    const out = await montar(p, client).flush(new Date());

    expect(out).toEqual({ campaigns: 1, sends: 2, failed: 1 });
    expect(updates(p)).toContainEqual({
      where: { id: { in: ['send-2'] } },
      data: { status: 'falhou', failure_reason: 'Telefone repetido no lote.' },
    });
    const body = client.request.mock.calls[0]![2] as { contacts: { phone: string }[] };
    expect(body.contacts.map((c) => c.phone)).toEqual(['+553199990001', '+553199990003']);
    // Só quem entrou na campanha é pendurado nela.
    expect(updates(p)).toContainEqual({
      where: { id: { in: ['send-1', 'send-3'] } },
      data: { freela_campaign_id: 'fc-1' },
    });
  });

  it('lote inteiro com telefone inválido não cria campanha nenhuma', async () => {
    const p = fakePrisma();
    p.msg_sends.findMany.mockResolvedValue([send(1, { lead: { ...baseSend(1).lead, phone: 'sem numero' } })]);
    const client = fakeClient();

    const out = await montar(p, client).flush(new Date());

    expect(out).toEqual({ campaigns: 0, sends: 0, failed: 1 });
    expect(client.request).not.toHaveBeenCalled();
    // Ninguém sobrou na fila: o disparo fecha.
    expect(p.disparos.updateMany).toHaveBeenCalled();
  });

  it('nome do lead entra quando o decisor é o travessão do funil', async () => {
    const p = fakePrisma();
    p.msg_sends.findMany.mockResolvedValue([send(1, { lead: { ...baseSend(1).lead, decisor: '—' } })]);

    const client = fakeClient();
    await montar(p, client).flush(new Date());

    const body = client.request.mock.calls[0]![2] as { contacts: { name: string }[] };
    expect(body.contacts[0]!.name).toBe('Casa 1');
  });

  it('modelo com variante B manda as duas variantes separadas por ---', async () => {
    const p = fakePrisma();
    p.msg_templates.findUnique.mockResolvedValue({
      name: 'Toque 1',
      text_a: 'Oi {{primeiro_nome_dono}}, variante A.',
      text_b: 'Oi {{primeiro_nome_dono}}, variante B.',
    });
    p.disparos.findUnique.mockResolvedValue({
      id: DISPARO,
      name: 'Toque 1 · 09/09/2026',
      by: DIEGO,
      split: true,
      template_id: 'tpl-1',
      filters: { praca_id: PRACA },
      status: 'agendado',
    });
    p.msg_sends.findMany.mockResolvedValue([send(1)]);

    const client = fakeClient();
    await montar(p, client).flush(new Date());

    const body = client.request.mock.calls[0]![2] as { whatsappTemplate: string };
    expect(body.whatsappTemplate.split('\n---\n')).toHaveLength(2);
  });

  it('campanha que o Freela recusa deixa os envios na fila para a próxima rodada', async () => {
    const p = fakePrisma();
    p.msg_sends.findMany.mockResolvedValue([send(1)]);
    const client = fakeClient((method, path) => {
      if (method === 'POST' && path === '/v1/admins/activation-campaigns') {
        throw new Error('Freela fora do ar');
      }
      return undefined;
    });

    const out = await montar(p, client).flush(new Date());

    expect(out).toEqual({ campaigns: 0, sends: 0, failed: 0 });
    expect(p.freela_campaigns.create).not.toHaveBeenCalled();
    expect(updates(p)).not.toContainEqual(expect.objectContaining({ data: { freela_campaign_id: 'fc-1' } }));
  });

  it('fila vazia não fala com o Freela', async () => {
    const p = fakePrisma();
    const client = fakeClient();

    const out = await montar(p, client).flush(new Date());

    expect(out).toEqual({ campaigns: 0, sends: 0, failed: 0 });
    expect(client.request).not.toHaveBeenCalled();
    expect(p.msg_sends.findMany).toHaveBeenCalledTimes(1);
  });

  it('a garimpagem da fila roda com lock consultivo, numa transação só', async () => {
    const p = fakePrisma();
    const client = fakeClient();

    await montar(p, client).flush(new Date());

    expect(p.$executeRaw).toHaveBeenCalledTimes(1);
    const where = (p.msg_sends.findMany.mock.calls[0]![0] as { where: Record<string, unknown> }).where;
    expect(where).toMatchObject({ mode: 'freela', status: 'fila', freela_campaign_id: null });
  });
});

describe('FreelaOutboxService.flush — lote de cadência', () => {
  it('mensagens de cadência viram uma campanha só, com o nome do horário de Brasília', async () => {
    const p = fakePrisma();
    p.msg_sends.findMany.mockResolvedValue([
      send(1, { disparo_id: null, cadence_id: 'cad-1' }),
      send(2, { disparo_id: null, cadence_id: 'cad-1' }),
    ]);
    const client = fakeClient();

    const out = await montar(p, client).flush(new Date('2026-09-09T15:30:00Z'));

    expect(out).toEqual({ campaigns: 1, sends: 2, failed: 0 });
    const body = client.request.mock.calls[0]![2] as Record<string, unknown>;
    // 15:30 UTC = 12:30 em Brasília.
    expect(body.name).toBe('Cadências — 09/09 12:30');
    expect(body.listFileName).toBe('praca:cadencia');
    // Texto do primeiro envio, como variante única (o Freela não tem as
    // variáveis por lead do Praça).
    expect(body.whatsappTemplate).toBe('Oi Chefe1, tudo bem?');
    expect(p.freela_campaigns.create.mock.calls[0]![0]).toMatchObject({
      data: expect.objectContaining({ kind: 'cadencia', disparo_id: null, created_by: DIEGO }),
    });
  });

  it('disparo e cadência na mesma rodada viram DUAS campanhas', async () => {
    const p = fakePrisma();
    p.msg_sends.findMany.mockResolvedValue([send(1), send(2, { disparo_id: null, cadence_id: 'cad-1' })]);
    const client = fakeClient();

    const out = await montar(p, client).flush(new Date('2026-09-09T15:30:00Z'));

    expect(out.campaigns).toBe(2);
    expect(client.request.mock.calls.filter((c) => c[1] === '/v1/admins/activation-campaigns')).toHaveLength(
      2,
    );
  });

  it('sem nenhum admin ativo o lote de cadência fica na fila (não inventa autor)', async () => {
    const p = fakePrisma();
    p.users.findFirst.mockResolvedValue(null);
    p.msg_sends.findMany.mockResolvedValue([send(1, { disparo_id: null, cadence_id: 'cad-1' })]);
    const client = fakeClient();

    const out = await montar(p, client).flush(new Date());

    expect(out).toEqual({ campaigns: 0, sends: 0, failed: 0 });
    expect(client.request).not.toHaveBeenCalled();
  });
});
