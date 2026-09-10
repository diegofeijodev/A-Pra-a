/**
 * A volta da campanha: o que o Freela já mandou virando `enviada`/`falhou` no
 * Praça (§18.6).
 *
 * Os destinatários usam o **formato real** da API do Freela, conferido em
 * `api-freela/src/shared/activation-campaigns/application/activation-campaign.service.ts`
 * (`RecipientView` + `recipientsBaseSql`): a resposta é
 * `{data: {total, page, pageSize, items: [...]}}` e o telefone chega no campo
 * **`phone`** (`COALESCE(external_phone, users.phone, destination)`). Foi
 * exatamente aqui que a primeira versão errou — casava por `externalPhone`,
 * que não existe, e nenhum envio saía da fila.
 */
import { Logger } from '@nestjs/common';
import { DEFAULT_TEMPLATE_DEFAULTS } from '../../../domain/catalog/messages';
import type { PrismaService } from '../../../common/database/prisma.service';
import type { DisparosService } from '../../disparos/disparos.service';
import type { MessagesService, SettingsView } from '../../messages/messages.service';
import { FreelaCampaignsService } from '../freela-campaigns.service';
import { FreelaClient } from '../freela-client';

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

const DISPARO = '22222222-2222-4222-8222-222222222222';
const CADENCIA = '44444444-4444-4444-8444-444444444444';
const ENVIADO_EM = '2026-09-09T15:04:05.000Z';

/** `GET /v1/admins/activation-campaigns/:id` — corpo real do Freela. */
const DETALHE = {
  data: {
    campaign: { id: 'fc-1', name: 'Toque 1 · 09/09/2026', status: 'RUNNING' },
    stats: { PENDING: 1, SENT: 1, FAILED: 0, SKIPPED: 0 },
    byChannel: { WHATSAPP: 2, EMAIL: 0 },
    total: 2,
    estimate: { days: 1 },
    counts: { total: 2, pending: 1, sent: 1, failed: 0, skipped: 0, contacted: 0, registered: 0 },
    createdBy: { id: 'adm-1', name: 'Praça' },
    startedBy: null,
  },
};

/** Uma linha de `RecipientView` (só os campos que a sincronização olha). */
function recipient(over: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 'rec-1',
    name: 'Chefe1 Teste',
    phone: '+553199990001',
    email: null,
    city: null,
    channel: 'WHATSAPP',
    status: 'PENDING',
    attempts: 1,
    variantIndex: 0,
    sentAt: null,
    failureReason: null,
    createdAt: '2026-09-09T14:00:00.000Z',
    contactedAt: null,
    contactedBy: null,
    contactNote: null,
    registered: null,
    ...over,
  };
}

/** `GET /:id/recipients` — `{data: {total, page, pageSize, items}}`. */
function pagina(items: Record<string, unknown>[]): unknown {
  return { data: { total: items.length, page: 1, pageSize: 200, items } };
}

/** Um `msg_sends` pendurado na campanha, como a sincronização o lê. */
function send(n: number, over: Record<string, unknown> = {}) {
  return {
    id: `send-${n}`,
    disparo_id: DISPARO as string | null,
    cadence_id: null as string | null,
    lead_id: `lead-${n}`,
    lead: { id: `lead-${n}`, phone: `(31) 9999-000${n}` },
    ...over,
  };
}

function fakePrisma() {
  const p = {
    $transaction: jest.fn(),
    freela_campaigns: {
      update: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
      // Espelho da campanha: `RUNNING` é o caso normal (nada a reiniciar).
      findUnique: jest.fn().mockResolvedValue({ status: 'RUNNING', kind: 'disparo' }),
    },
    msg_sends: {
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
      count: jest.fn().mockResolvedValue(0),
    },
    lead_events: { create: jest.fn().mockResolvedValue({}) },
    leads: { update: jest.fn().mockResolvedValue({}) },
    disparos: {
      findMany: jest.fn().mockResolvedValue([{ id: DISPARO, name: 'Toque 1 · 09/09/2026' }]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    cadences: { findMany: jest.fn().mockResolvedValue([{ id: CADENCIA, name: 'Reativação' }]) },
  };
  // `$transaction` aceita as duas formas: lista de promessas (é a que a
  // sincronização usa, um commit por envio) e callback.
  p.$transaction.mockImplementation(async (arg: unknown) =>
    Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => Promise<unknown>)(p),
  );
  return p;
}

type Fake = ReturnType<typeof fakePrisma>;

function fakeClient(paginas: unknown[] = [pagina([])]) {
  let i = 0;
  const request = jest.fn().mockImplementation(async (_m: string, path: string) => {
    if (path.includes('/recipients')) return paginas[Math.min(i++, paginas.length - 1)];
    return DETALHE;
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
  return new FreelaCampaignsService(
    p as unknown as PrismaService,
    client,
    {} as unknown as DisparosService,
    messages,
  );
}

describe('FreelaCampaignsService.syncOne — espelho', () => {
  it('copia status, contagens e a hora da sincronização', async () => {
    const p = fakePrisma();

    await montar(p, fakeClient()).syncOne('fc-1');

    const escrito = p.freela_campaigns.update.mock.calls[0]![0] as {
      where: unknown;
      data: Record<string, unknown>;
    };
    expect(escrito.where).toEqual({ freela_id: 'fc-1' });
    expect(escrito.data.status).toBe('RUNNING');
    expect(escrito.data.stats).toEqual(DETALHE.data.counts);
    expect(escrito.data.last_synced_at).toBeInstanceOf(Date);
  });

  it('campanha sem envio pendurado não pagina destinatário', async () => {
    const p = fakePrisma();
    const client = fakeClient();

    await montar(p, client).syncOne('fc-1');

    expect(client.request.mock.calls.filter((c) => String(c[1]).includes('/recipients'))).toHaveLength(0);
  });
});

describe('FreelaCampaignsService.syncOne — envios', () => {
  it('SENT vira enviada com a hora do Freela, o id do destinatário e UM evento no lead', async () => {
    const p = fakePrisma();
    p.msg_sends.findMany.mockResolvedValue([send(1)]);
    const client = fakeClient([pagina([recipient({ id: 'rec-1', status: 'SENT', sentAt: ENVIADO_EM })])]);

    await montar(p, client).syncOne('fc-1');

    expect(p.msg_sends.update).toHaveBeenCalledWith({
      where: { id: 'send-1' },
      data: {
        status: 'enviada',
        sent_at: new Date(ENVIADO_EM),
        freela_recipient_id: 'rec-1',
      },
    });
    expect(p.lead_events.create).toHaveBeenCalledTimes(1);
    expect(p.lead_events.create.mock.calls[0]![0]).toEqual({
      data: {
        lead_id: 'lead-1',
        at: new Date(ENVIADO_EM),
        kind: 'msg_out',
        text: 'Toque 1 · 09/09/2026 enviada pelo Freela (WhatsApp).',
      },
    });
    expect(p.leads.update).toHaveBeenCalledWith({
      where: { id: 'lead-1' },
      data: { last_contact_at: new Date(ENVIADO_EM) },
    });
    // Um commit só por envio: marcar enviada sem gravar o evento (ou o
    // contrário) deixaria a ficha do lead mentindo.
    expect(p.$transaction).toHaveBeenCalled();
  });

  it('a segunda sincronização não grava um segundo evento', async () => {
    const p = fakePrisma();
    const client = fakeClient([pagina([recipient({ id: 'rec-1', status: 'SENT', sentAt: ENVIADO_EM })])]);
    const service = montar(p, client);

    p.msg_sends.findMany.mockResolvedValueOnce([send(1)]);
    await service.syncOne('fc-1');
    // Na segunda rodada o envio já não está mais em `fila` — é o filtro da
    // consulta que garante "uma vez só".
    p.msg_sends.findMany.mockResolvedValueOnce([]);
    await service.syncOne('fc-1');

    expect(p.lead_events.create).toHaveBeenCalledTimes(1);
    expect(p.msg_sends.update).toHaveBeenCalledTimes(1);
  });

  it('FAILED vira falhou com o motivo que o Freela deu', async () => {
    const p = fakePrisma();
    p.msg_sends.findMany.mockResolvedValue([send(1)]);
    const client = fakeClient([
      pagina([recipient({ id: 'rec-9', status: 'FAILED', failureReason: 'Número não tem WhatsApp.' })]),
    ]);

    await montar(p, client).syncOne('fc-1');

    expect(p.msg_sends.update).toHaveBeenCalledWith({
      where: { id: 'send-1' },
      data: {
        status: 'falhou',
        failure_reason: 'Número não tem WhatsApp.',
        freela_recipient_id: 'rec-9',
      },
    });
    expect(p.lead_events.create).not.toHaveBeenCalled();
  });

  it('SKIPPED sem motivo vira falhou com a frase do Praça', async () => {
    const p = fakePrisma();
    p.msg_sends.findMany.mockResolvedValue([send(1)]);
    const client = fakeClient([pagina([recipient({ status: 'SKIPPED', failureReason: null })])]);

    await montar(p, client).syncOne('fc-1');

    expect(p.msg_sends.update.mock.calls[0]![0]).toMatchObject({
      data: expect.objectContaining({
        status: 'falhou',
        failure_reason: 'O Freela pulou este contato.',
      }),
    });
  });

  it('PENDING no Freela deixa o envio na fila', async () => {
    const p = fakePrisma();
    p.msg_sends.findMany.mockResolvedValue([send(1)]);
    const client = fakeClient([pagina([recipient({ status: 'PENDING' })])]);

    await montar(p, client).syncOne('fc-1');

    expect(p.msg_sends.update).not.toHaveBeenCalled();
    expect(p.lead_events.create).not.toHaveBeenCalled();
  });

  it('casa telefone com máscara dos dois lados (E.164 na comparação)', async () => {
    const p = fakePrisma();
    p.msg_sends.findMany.mockResolvedValue([send(1, { lead: { id: 'lead-1', phone: '(31) 9999-0001' } })]);
    const client = fakeClient([
      pagina([recipient({ phone: '+55 31 9999-0001', status: 'SENT', sentAt: ENVIADO_EM })]),
    ]);

    await montar(p, client).syncOne('fc-1');

    expect(p.msg_sends.update).toHaveBeenCalledTimes(1);
  });

  it('envio de cadência ganha o nome da cadência no evento', async () => {
    const p = fakePrisma();
    p.msg_sends.findMany.mockResolvedValue([send(1, { disparo_id: null, cadence_id: CADENCIA })]);
    const client = fakeClient([pagina([recipient({ status: 'SENT', sentAt: ENVIADO_EM })])]);

    await montar(p, client).syncOne('fc-1');

    expect(p.lead_events.create.mock.calls[0]![0]).toMatchObject({
      data: expect.objectContaining({
        text: 'Cadência “Reativação” enviada pelo Freela (WhatsApp).',
      }),
    });
  });

  it('disparo sem ninguém na fila vira concluido', async () => {
    const p = fakePrisma();
    p.msg_sends.findMany.mockResolvedValue([send(1)]);
    p.msg_sends.count.mockResolvedValue(0);
    const client = fakeClient([pagina([recipient({ status: 'SENT', sentAt: ENVIADO_EM })])]);

    await montar(p, client).syncOne('fc-1');

    expect(p.disparos.updateMany).toHaveBeenCalledWith({
      where: { id: DISPARO, status: { not: 'concluido' } },
      data: { status: 'concluido' },
    });
  });

  it('disparo com envio ainda na fila NÃO é fechado', async () => {
    const p = fakePrisma();
    p.msg_sends.findMany.mockResolvedValue([send(1)]);
    p.msg_sends.count.mockResolvedValue(3);
    const client = fakeClient([pagina([recipient({ status: 'SENT', sentAt: ENVIADO_EM })])]);

    await montar(p, client).syncOne('fc-1');

    expect(p.disparos.updateMany).not.toHaveBeenCalled();
  });

  it('sem destinatário com telefone, avisa no log e não escreve nada', async () => {
    const aviso = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const p = fakePrisma();
    p.msg_sends.findMany.mockResolvedValue([send(1)]);
    const client = fakeClient([pagina([recipient({ phone: null })])]);

    await montar(p, client).syncOne('fc-1');

    expect(p.msg_sends.update).not.toHaveBeenCalled();
    expect(aviso).toHaveBeenCalledWith(expect.stringContaining('nenhum destinatário com telefone lido'));
    aviso.mockRestore();
  });

  it('pagina até acabar (página cheia = tem mais)', async () => {
    const p = fakePrisma();
    p.msg_sends.findMany.mockResolvedValue([send(1)]);
    const cheia = pagina(
      Array.from({ length: 200 }, (_, i) =>
        recipient({ id: `r${i}`, phone: `+5531999${String(i).padStart(5, '0')}` }),
      ),
    );
    const ultima = pagina([recipient({ id: 'rec-1', status: 'SENT', sentAt: ENVIADO_EM })]);
    const client = fakeClient([cheia, ultima]);

    await montar(p, client).syncOne('fc-1');

    const paginas = client.request.mock.calls.filter((c) => String(c[1]).includes('/recipients'));
    expect(paginas).toHaveLength(2);
    expect(String(paginas[0]![1])).toContain('page=1&pageSize=200');
    expect(String(paginas[1]![1])).toContain('page=2&pageSize=200');
    expect(p.msg_sends.update).toHaveBeenCalledTimes(1);
  });
});

describe('FreelaCampaignsService.syncOne — start que ficou pendurado', () => {
  it('espelho DRAFT de lote do outbox manda começar ANTES de ler o status', async () => {
    const p = fakePrisma();
    p.freela_campaigns.findUnique.mockResolvedValue({ status: 'DRAFT', kind: 'disparo' });
    const client = fakeClient();

    await montar(p, client).syncOne('fc-1');

    const caminhos = client.request.mock.calls.map((c) => `${String(c[0])} ${String(c[1])}`);
    expect(caminhos[0]).toBe('PATCH /v1/admins/activation-campaigns/fc-1/start');
    expect(caminhos[1]).toBe('GET /v1/admins/activation-campaigns/fc-1');
    // O start que deu certo já escreve RUNNING no espelho.
    expect(p.freela_campaigns.update.mock.calls[0]![0]).toMatchObject({
      data: expect.objectContaining({ status: 'RUNNING' }),
    });
  });

  it('lote de cadência em DRAFT também é reiniciado', async () => {
    const p = fakePrisma();
    p.freela_campaigns.findUnique.mockResolvedValue({ status: 'DRAFT', kind: 'cadencia' });
    const client = fakeClient();

    await montar(p, client).syncOne('fc-1');

    expect(client.request.mock.calls[0]![0]).toBe('PATCH');
  });

  it('campanha de tela em DRAFT NÃO é iniciada (alguém pediu para não começar)', async () => {
    const p = fakePrisma();
    p.freela_campaigns.findUnique.mockResolvedValue({ status: 'DRAFT', kind: 'base' });
    const client = fakeClient();

    await montar(p, client).syncOne('fc-1');

    expect(client.request.mock.calls.filter((c) => c[0] === 'PATCH')).toHaveLength(0);
  });

  it('campanha que já está RUNNING não é reiniciada', async () => {
    const p = fakePrisma();
    const client = fakeClient();

    await montar(p, client).syncOne('fc-1');

    expect(client.request.mock.calls.filter((c) => c[0] === 'PATCH')).toHaveLength(0);
  });

  it('start que falha de novo não derruba a sincronização: fica DRAFT e tenta na próxima', async () => {
    const aviso = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const p = fakePrisma();
    p.freela_campaigns.findUnique.mockResolvedValue({ status: 'DRAFT', kind: 'disparo' });
    const client = fakeClient();
    client.request.mockImplementation(async (method: string, path: string) => {
      if (method === 'PATCH') throw new Error('Freela fora do ar');
      if (path.includes('/recipients')) return pagina([]);
      return DETALHE;
    });

    await expect(montar(p, client).syncOne('fc-1')).resolves.toBeUndefined();

    // Nenhuma escrita de status vindo do start; só a do `GET` que veio depois.
    expect(p.freela_campaigns.update).toHaveBeenCalledTimes(1);
    expect(aviso).toHaveBeenCalledWith(expect.stringContaining('não começou'));
    aviso.mockRestore();
  });
});

describe('FreelaCampaignsService.syncAll', () => {
  it('só sincroniza campanha que ainda anda, e uma que falha não para as outras', async () => {
    const p = fakePrisma();
    p.freela_campaigns.findMany.mockResolvedValue([{ freela_id: 'fc-1' }, { freela_id: 'fc-2' }]);
    const client = fakeClient();
    client.request.mockImplementation(async (_m: string, path: string) => {
      if (path.endsWith('fc-1')) throw new Error('Freela fora do ar');
      if (path.includes('/recipients')) return pagina([]);
      return DETALHE;
    });

    const out = await montar(p, client).syncAll();

    expect(out).toEqual({ synced: 1 });
    expect(p.freela_campaigns.findMany.mock.calls[0]![0]).toMatchObject({
      where: { status: { notIn: ['COMPLETED', 'CANCELLED'] } },
    });
  });
});
