/**
 * `POST /v1/freela/campaigns` com `EXTERNAL_LIST` — a caixa "Freela → Nova"
 * (§18.7).
 *
 * O ponto destes testes é o **rastro no Praça**: a campanha criada pela tela
 * tem de deixar `msg_sends` como o disparo em modo `freela` deixa (§18.5),
 * senão a trava de 30 dias por modelo é lida e nunca escrita (mandar duas vezes
 * acerta as mesmas pessoas) e a ficha do lead não mostra que um WhatsApp saiu.
 */
import { Logger } from '@nestjs/common';
import { DEFAULT_TEMPLATE_DEFAULTS } from '../../../domain/catalog/messages';
import type { PrismaService } from '../../../common/database/prisma.service';
import type { AuthUser } from '../../../common/auth/auth-user';
import type { DisparosService } from '../../disparos/disparos.service';
import type { MessagesService, SettingsView } from '../../messages/messages.service';
import { FreelaCampaignsService, type FreelaLeadContact } from '../freela-campaigns.service';
import { FreelaClient } from '../freela-client';
import type { CreateFreelaCampaignDto } from '../dto/freela.dto';

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
const TEMPLATE = '55555555-5555-4555-8555-555555555555';
const DIEGO = '33333333-3333-4333-8333-333333333333';
const USER = { id: DIEGO, name: 'Diego Souza', is_admin: true } as AuthUser;

const CAMPAIGNS_PATH = '/v1/admins/activation-campaigns';

function lead(n: number, over: Partial<FreelaLeadContact> = {}): FreelaLeadContact {
  return {
    id: `lead-${n}`,
    name: `Casa ${n}`,
    decisor: `Chefe${n} Teste`,
    phone: `(31) 9999-000${n}`,
    city: 'Belo Horizonte',
    text: '',
    ...over,
  };
}

function fakePrisma() {
  const p = {
    $transaction: jest.fn(),
    pracas: {
      findUnique: jest.fn().mockResolvedValue({
        name: 'BH · Setembro',
        start_date: '2026-09-14',
        city: 'Belo Horizonte',
        cobertura_cidade: 'Belo Horizonte',
      }),
    },
    msg_templates: {
      findUnique: jest.fn().mockResolvedValue({
        text_a: 'Oi {{primeiro_nome_dono}}, sou {{meu_nome}}. E o {{estabelecimento}} em {{cidade}}?',
        text_b: null,
      }),
    },
    leads: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'lead-1', stage: 3 },
        { id: 'lead-2', stage: 1 },
      ]),
    },
    msg_sends: {
      createMany: jest.fn().mockResolvedValue({ count: 2 }),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    freela_campaigns: {
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn().mockResolvedValue({
        id: 'row-1',
        freela_id: 'fc-1',
        name: 'Reativação BH',
        kind: 'manual',
        praca_id: PRACA,
        disparo_id: null,
        audience: 'EXTERNAL_LIST',
        audience_filters: null,
        status: 'RUNNING',
        stats: null,
        created_by: DIEGO,
        created_at: new Date('2026-09-09T12:00:00Z'),
        last_synced_at: null,
      }),
    },
  };
  p.$transaction.mockImplementation(async (arg: unknown) =>
    Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => Promise<unknown>)(p),
  );
  return p;
}

type Fake = ReturnType<typeof fakePrisma>;

function fakeClient() {
  const request = jest.fn().mockImplementation(async (method: string, path: string) => {
    if (method === 'POST' && path === CAMPAIGNS_PATH) return { data: { id: 'fc-1', status: 'DRAFT' } };
    return { data: { id: 'fc-1', status: 'RUNNING' } };
  });
  return {
    request,
    isConfigured: () => true,
    ensureConfigured: () => undefined,
    perContactMessage: () => false,
  } as unknown as FreelaClient & { request: jest.Mock };
}

function montar(p: Fake, client: FreelaClient, leads: FreelaLeadContact[]) {
  const messages = { getSettings: jest.fn().mockResolvedValue(SETTINGS) } as unknown as MessagesService;
  const disparos = {
    audienceForFreela: jest.fn().mockResolvedValue({ leads, blocked: 0, dupes: 0 }),
  } as unknown as DisparosService;
  return new FreelaCampaignsService(p as unknown as PrismaService, client, disparos, messages);
}

function dto(over: Partial<CreateFreelaCampaignDto> = {}): CreateFreelaCampaignDto {
  return {
    name: 'Reativação BH',
    praca_id: PRACA,
    audience: 'EXTERNAL_LIST',
    template_id: TEMPLATE,
    lead_filters: { praca_id: PRACA, stage: 0, owner_id: 'all', archived: false },
    start_now: true,
    ...over,
  } as CreateFreelaCampaignDto;
}

/** Linhas que o espelho gravou em `msg_sends`. */
function espelhados(p: Fake): Record<string, unknown>[] {
  const call = p.msg_sends.createMany.mock.calls[0]?.[0] as { data: Record<string, unknown>[] } | undefined;
  return call?.data ?? [];
}

describe('FreelaCampaignsService.create — espelho dos envios (§18.7)', () => {
  it('grava um msg_sends por destinatário, já preso à campanha', async () => {
    const p = fakePrisma();
    const client = fakeClient();

    const out = await montar(p, client, [lead(1), lead(2)]).create(dto(), USER);

    expect(out.recipients_count).toBe(2);
    const linhas = espelhados(p);
    expect(linhas).toHaveLength(2);
    expect(linhas[0]).toMatchObject({
      template_id: TEMPLATE,
      lead_id: 'lead-1',
      mode: 'freela',
      status: 'fila',
      channel: 'whatsapp',
      variant: 'A',
      // Já com a campanha: nascer sem ela faria a rodada do outbox garimpar
      // estes envios e criar uma SEGUNDA campanha para as mesmas pessoas.
      freela_campaign_id: 'fc-1',
      // A etapa do funil no momento do envio vem do banco (é o que as métricas
      // de modelo leem).
      stage_at_send: 3,
    });
    expect(linhas[1]).toMatchObject({ lead_id: 'lead-2', stage_at_send: 1 });
    // Sem `FREELA_PER_CONTACT_MESSAGE` o texto por lead não é renderizado:
    // fica o modelo convertido, que é o que o Freela vai mandar.
    expect(linhas[0]!.text).toContain('{{primeiro_nome}}');
    // Nem disparo nem cadência: é campanha da tela.
    expect(linhas[0]!.disparo_id).toBeUndefined();
    expect(linhas[0]!.cadence_id).toBeUndefined();
  });

  it('a campanha é criada no Freela ANTES de o espelho ser gravado', async () => {
    const p = fakePrisma();
    const client = fakeClient();
    const ordem: string[] = [];
    client.request.mockImplementation(async (method: string, path: string) => {
      ordem.push(`freela:${method}`);
      if (method === 'POST' && path === CAMPAIGNS_PATH) return { data: { id: 'fc-1', status: 'DRAFT' } };
      return { data: { id: 'fc-1', status: 'RUNNING' } };
    });
    p.msg_sends.createMany.mockImplementation(async () => {
      ordem.push('espelho');
      return { count: 2 };
    });

    await montar(p, client, [lead(1), lead(2)]).create(dto(), USER);

    expect(ordem[0]).toBe('freela:POST');
    expect(ordem).toContain('espelho');
    expect(ordem.indexOf('espelho')).toBeGreaterThan(ordem.indexOf('freela:POST'));
    expect(p.freela_campaigns.create).toHaveBeenCalledTimes(1);
  });

  it('lead com telefone inválido não entra no espelho (não entrou na campanha)', async () => {
    const p = fakePrisma();
    p.leads.findMany.mockResolvedValue([{ id: 'lead-1', stage: 3 }]);
    const client = fakeClient();

    await montar(p, client, [lead(1), lead(2, { phone: '123' })]).create(dto(), USER);

    expect(espelhados(p).map((l) => l.lead_id)).toEqual(['lead-1']);
  });

  it('texto escrito na mão (sem modelo) grava o envio com template_id nulo — sem trava', async () => {
    const p = fakePrisma();
    const client = fakeClient();

    await montar(p, client, [lead(1), lead(2)]).create(
      dto({ template_id: undefined, whatsapp_template: 'Oi {{primeiro_nome}}, temos vaga hoje.' }),
      USER,
    );

    const linhas = espelhados(p);
    expect(linhas).toHaveLength(2);
    expect(linhas[0]!.template_id).toBeNull();
    expect(linhas[0]!.text).toBe('Oi {{primeiro_nome}}, temos vaga hoje.');
  });

  it('falhar ao espelhar NÃO derruba a resposta: a campanha já está no Freela', async () => {
    const p = fakePrisma();
    p.msg_sends.createMany.mockRejectedValue(new Error('banco caiu'));
    const client = fakeClient();
    // O aviso vai para o log do Nest; o que importa é a resposta não virar erro
    // (dizer "não deu" para uma campanha que VAI enviar é pior que o rastro
    // faltando).
    const mudo = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    const out = await montar(p, client, [lead(1), lead(2)]).create(dto(), USER);

    expect(out.campaign.freela_id).toBe('fc-1');
    expect(mudo).toHaveBeenCalled();
    mudo.mockRestore();
  });

  it('público de outro tipo (base do Freela) não grava envio nenhum', async () => {
    const p = fakePrisma();
    const client = fakeClient();

    await montar(p, client, []).create(
      dto({ audience: 'CONTRACTORS_DORMANT_90D', template_id: TEMPLATE, lead_filters: undefined }),
      USER,
    );

    expect(p.msg_sends.createMany).not.toHaveBeenCalled();
  });
});
