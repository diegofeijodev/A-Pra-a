/**
 * O que este spec cobre do `DisparosService`:
 *
 * - a prévia com **texto escrito na mão** (`text`, §13): renderiza, alterna as
 *   variantes do `---` e não tem trava de 30 dias (a trava é por modelo);
 * - a **guarda do modo `freela`** em `POST /v1/sends/:id/mark` (§18.5): quem
 *   marca lá é o Freela; `reply` continua liberado nos dois modos;
 * - a regra de corpo do DTO (`template_id` XOR `text`).
 */
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import type { PrismaService } from '../../../common/database/prisma.service';
import { DEFAULT_TEMPLATE_DEFAULTS } from '../../../domain/catalog/messages';
import type { FreelaClient } from '../../freela/freela-client';
import type { LeadsService, LeadListView } from '../../leads/leads.service';
import type { MessagesService, SettingsView } from '../../messages/messages.service';
import { DisparosService } from '../disparos.service';
import { PreviewDisparoDto } from '../dto/disparos.dto';

const PRACA = '11111111-1111-4111-8111-111111111111';
const TEMPLATE = '22222222-2222-4222-8222-222222222222';
const DIEGO = {
  id: '33333333-3333-4333-8333-333333333333',
  email: 'diego@praca.local',
  name: 'Diego Souza',
  is_admin: true,
};

const SETTINGS: SettingsView = {
  mode: 'fila',
  window_start: 9,
  window_end: 19,
  sunday: false,
  daily_limit: 200,
  gap_min: 20,
  gap_max: 90,
  daily_quota: 20,
  template_defaults: DEFAULT_TEMPLATE_DEFAULTS,
};

/** Um lead do público, no recorte que o plano do lote enxerga. */
function lead(n: number): LeadListView {
  return {
    id: `lead-${n}`,
    praca_id: PRACA,
    name: `Casa ${n}`,
    city: 'Belo Horizonte',
    address: 'Rua X, 120, Savassi',
    decisor: `Chefe${n} Teste`,
    phone: `(31) 99999-000${n}`,
    stage: 1,
    stalled_days: 0,
  } as unknown as LeadListView;
}

/** A linha de `leads` do jeito que `audience()` a lê, antes do `toListView`. */
function linhaCrua(n: number) {
  return { id: `lead-${n}`, events: [], _count: { events: 0, vagas: 0 }, vagas: [] };
}

function fakePrisma() {
  const p = {
    // A transação roda o callback com o PRÓPRIO objeto: os mesmos mocks valem
    // dentro e fora dela.
    $transaction: jest.fn(),
    // Duas linhas cruas do público: `toListView` (mockado) é quem as traduz.
    leads: {
      findMany: jest.fn().mockResolvedValue([linhaCrua(1), linhaCrua(2)]),
      update: jest.fn(),
    },
    pracas: {
      findMany: jest.fn().mockResolvedValue([{ id: PRACA, name: 'Praça BH', start_date: '2026-10-01' }]),
      findUnique: jest.fn().mockResolvedValue({
        id: PRACA,
        name: 'Praça BH',
        start_date: '2026-10-01',
        city: 'Belo Horizonte',
        cobertura_cidade: '',
      }),
    },
    msg_sends: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      update: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    },
    msg_templates: { findUnique: jest.fn().mockResolvedValue({ name: 'Contratante · toque 1' }) },
    lead_events: { create: jest.fn() },
    disparos: { updateMany: jest.fn() },
  };
  p.$transaction.mockImplementation((cb: (tx: typeof p) => unknown) => cb(p));
  return p;
}

function build() {
  const prisma = fakePrisma();
  let i = 0;
  const leads = {
    toListView: jest.fn(() => lead(++i)),
  } as unknown as LeadsService;
  const messages = {
    getSettings: jest.fn().mockResolvedValue(SETTINGS),
    blockedKeys: jest.fn().mockResolvedValue(new Set<string>()),
    neighborsByCity: jest.fn().mockResolvedValue(new Map()),
    blockIfNew: jest.fn(),
  } as unknown as MessagesService;
  const freela = { ensureConfigured: jest.fn() } as unknown as FreelaClient;
  const service = new DisparosService(prisma as unknown as PrismaService, leads, messages, freela);
  return { service, prisma, messages };
}

/** Corpo da prévia já transformado (é assim que ele chega no serviço). */
function preview(body: Record<string, unknown>) {
  return plainToInstance(PreviewDisparoDto, {
    filters: { praca_id: PRACA },
    split: false,
    mode: 'fila',
    ...body,
  });
}

describe('prévia com texto escrito na mão', () => {
  it('renderiza o texto avulso sem nenhum modelo salvo', async () => {
    const { service, prisma } = build();
    const out = await service.preview(
      preview({ text: 'Oi {{primeiro_nome_dono}}, e o {{estabelecimento}}?' }),
      DIEGO,
    );

    expect(out.previews[0]?.text).toBe('Oi Chefe1, e o Casa 1?');
    expect(prisma.msg_templates.findUnique).not.toHaveBeenCalled();
  });

  it('não tem trava de 30 dias: sem modelo não há o que comparar', async () => {
    const { service, prisma } = build();
    const out = await service.preview(preview({ text: 'Oi {{primeiro_nome_dono}}' }), DIEGO);

    expect(out.dupes).toBe(0);
    expect(out.sendable).toBe(2);
    // A consulta da trava nem sai — ela é `where: { template_id }`.
    expect(prisma.msg_sends.findMany).not.toHaveBeenCalled();
  });

  it('as variantes do `---` viram A e B nas mensagens de exemplo', async () => {
    const { service } = build();
    const out = await service.preview(
      preview({ text: 'Bom dia {{primeiro_nome_dono}}\n---\nBoa tarde {{primeiro_nome_dono}}', split: true }),
      DIEGO,
    );

    expect(out.previews.map((p) => p.variant)).toEqual(['A', 'B']);
    expect(out.previews[0]?.text).toBe('Bom dia Chefe1');
    expect(out.previews[1]?.text).toBe('Boa tarde Chefe2');
  });

  it('no modo freela o texto avulso é convertido pelo caminho do modelo', async () => {
    const { service } = build();
    const out = await service.preview(
      preview({
        text: 'Oi {{primeiro_nome}}, sou {{meu_nome}} da {{praca}}. E o {{estabelecimento}}?',
        mode: 'freela',
      }),
      DIEGO,
    );

    // `{{primeiro_nome}}` e `{{cidade}}` o Freela tem; `{{meu_nome}}`/`{{praca}}`
    // viram texto aqui; `{{estabelecimento}}` fica avisado.
    expect(out.freela?.template).toBe(
      'Oi {{primeiro_nome}}, sou Diego da Praça BH. E o {{estabelecimento}}?',
    );
    expect(out.freela?.unsupported_variables).toEqual(['estabelecimento']);
  });

  it('a conversão do modo freela leva TODAS as variantes do texto', async () => {
    const { service } = build();
    const out = await service.preview(preview({ text: 'Um\n---\nDois\n---\nTrês', mode: 'freela' }), DIEGO);

    expect(out.freela?.template).toBe('Um\n---\nDois\n---\nTrês');
  });
});

describe('corpo da prévia: modelo XOR texto', () => {
  const erros = async (body: Record<string, unknown>) =>
    (await validate(preview(body))).map((e) => e.property);

  it('sem modelo e sem texto é recusado', async () => {
    expect(await erros({})).toContain('template_id');
  });

  it('modelo e texto juntos são recusados', async () => {
    expect(await erros({ template_id: TEMPLATE, text: 'Oi' })).toContain('template_id');
  });

  it('modelo que não é UUID é recusado', async () => {
    expect(await erros({ template_id: 'nao-e-uuid' })).toContain('template_id');
  });

  it('só o modelo passa', async () => {
    expect(await erros({ template_id: TEMPLATE })).toEqual([]);
  });

  it('só o texto passa', async () => {
    expect(await erros({ text: 'Oi {{primeiro_nome}}' })).toEqual([]);
  });
});

describe('fila manual: guarda do modo freela', () => {
  const send = (mode: string) => ({
    id: 'send-1',
    mode,
    status: 'fila',
    disparo_id: 'disparo-1',
    template_id: TEMPLATE,
    lead_id: 'lead-1',
    variant: 'A',
    channel: 'whatsapp',
    text: 'Oi',
    sent_at: null,
    replied_at: null,
    failure_reason: null,
    scheduled_at: new Date('2026-09-10T12:00:00Z'),
    stage_at_send: 1,
    lead: { id: 'lead-1', name: 'Casa 1', city: 'Belo Horizonte', phone: '(31) 99999-0001', stage: 1 },
  });

  it('marcar envio do modo freela é 409 FREELA_SEND', async () => {
    const { service, prisma } = build();
    prisma.msg_sends.findUnique.mockResolvedValue(send('freela'));

    await expect(
      service.mark('44444444-4444-4444-8444-444444444444', { status: 'enviada' }, DIEGO),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: 'FREELA_SEND', message: 'Envio do modo Freela: quem marca é o Freela.' },
    });
    // Nada gravado: o outbox continua achando o envio em `fila`.
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('marcar entregue no modo freela também é recusado', async () => {
    const { service, prisma } = build();
    prisma.msg_sends.findUnique.mockResolvedValue(send('freela'));

    await expect(
      service.mark('44444444-4444-4444-8444-444444444444', { status: 'entregue' }, DIEGO),
    ).rejects.toMatchObject({
      response: { code: 'FREELA_SEND' },
    });
  });

  it('no modo fila marcar continua funcionando', async () => {
    const { service, prisma } = build();
    prisma.msg_sends.findUnique.mockResolvedValue({ ...send('fila'), status: 'enviada' });

    const out = await service.mark('44444444-4444-4444-8444-444444444444', { status: 'enviada' }, DIEGO);

    expect(out.status).toBe('enviada');
    expect(prisma.lead_events.create).toHaveBeenCalled();
  });

  it('responder é liberado nos dois modos', async () => {
    const { service, prisma } = build();
    prisma.msg_sends.findUnique.mockResolvedValue(send('freela'));

    const out = await service.reply(
      '44444444-4444-4444-8444-444444444444',
      { text: 'tenho interesse' },
      DIEGO,
    );

    expect(out).toEqual({ blocked: false });
    expect(prisma.msg_sends.update).toHaveBeenCalled();
  });
});
