/**
 * Lote B da Lovable, L3 (contrato §35): checklist da visita no VisitsService, com a flag desligada e ligada, nos DOIS fluxos.
 * O comportamento de hoje (flags desligadas) está congelado em `visits-checkout-caracterizacao.spec.ts`.
 */
import { ValidationPipe } from '@nestjs/common';
import type { CampoConsultant } from '../../../common/auth/campo-consultant';
import type { PrismaService } from '../../../common/database/prisma.service';
import { CONFIG_CHECKLIST, ETAPAS_PADRAO, type ConfigChecklist } from '../../../domain/checklist-rules';
import { CONFIG_MODO_PADRAO } from '../../../domain/modo-campo-rules';
import type { ModoCampoService } from '../../rotas/modo-campo.service';
import type { RotasConfigService } from '../../rotas/rotas-config.service';
import { AnswersDto } from '../dto/campo.dto';
import type { CheckinDto } from '../dto/campo.dto';
import type { JourneysService } from '../journeys.service';
import type { PhotoStorage } from '../photo-storage';
import type { PlacesService } from '../places.service';
import { VisitsService } from '../visits.service';

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});

const CONS = '44444444-4444-4444-8444-444444444444';
const PRACA = '00000000-0000-4000-8000-0000000000aa';
const LEAD = '99999999-9999-4999-8999-999999999999';
const CLIENT = '77777777-7777-4777-8777-777777777777';
const C: CampoConsultant = {
  id: CONS,
  name: 'Ana Souza',
  email: 'ana@exemplo.com',
  praca_id: PRACA,
  must_change_password: false,
};
const AGORA = new Date('2026-10-20T15:00:00.000Z');
const POS = { at: '2026-10-20T14:59:00.000Z', lat: -19.9245, lng: -43.9352, accuracy: 12 };
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const JORNADA = { id: 'j1', day: '2026-10-20', started_at: new Date('2026-10-20T12:00:00.000Z') };

const VAZIA = {
  interlocutor_name: null,
  interlocutor_role: null,
  freela_status: null,
  interest: null,
  open_vagas: null,
  vaga_roles: [] as string[],
  freelas_per_week: null,
  channels: [] as string[],
  channel_other: null,
  needs_followup: null,
  followup_what: null,
  followup_date: null,
  notes: null,
  outcome: 'conversa',
  refusal_reason: null,
  refusal_note: null,
  followup_time: null,
  contact_phone: null,
  result: null,
  distance_note: null,
};
const LINHA = {
  id: 'v1',
  client_id: CLIENT,
  journey_id: 'j1',
  consultant_id: CONS,
  lead_id: LEAD,
  checkin_at: new Date('2026-10-20T14:00:00.000Z'),
  checkin_lat: -19.9245,
  checkin_lng: -43.9352,
  checkin_accuracy: 10,
  distance_m: null,
  far_from_place: false,
  photo_key: `campo/${CONS}/2026-10-20/v1.jpg`,
  photo_bytes: 6,
  checkout_at: null as Date | null,
  checkout_lat: null,
  checkout_lng: null,
  auto_closed: false,
  clock_adjusted: false,
  flow: 'simples',
  checklist: null as unknown,
  ...VAZIA,
  lead: { name: 'Bar do Mercado', possible_dup: false },
};
const foto = (required: 'nao' | 'todas', n = 3) => ({
  required,
  items: ETAPAS_PADRAO.slice(0, n).map((e) => ({ ...e, done: false, note: null })),
});

function fakePrisma(linha: Record<string, unknown>) {
  const p = {
    $transaction: jest.fn(),
    field_visits: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(linha),
      findUniqueOrThrow: jest.fn().mockResolvedValue(linha),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    field_points: { create: jest.fn().mockResolvedValue({}) },
    field_route_stops: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    leads: {
      findFirst: jest.fn().mockResolvedValue({ id: LEAD, lat: null, lng: null }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: LEAD, stage: 1, name: 'Bar do Mercado' }),
      update: jest.fn().mockResolvedValue({}),
    },
    lead_events: { create: jest.fn().mockResolvedValue({}) },
  };
  p.$transaction.mockImplementation(async (arg: unknown) =>
    Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => Promise<unknown>)(p),
  );
  return p;
}

function servico(
  p: ReturnType<typeof fakePrisma>,
  o: { checklist: boolean; cfg?: ConfigChecklist; fluxo?: 'simples' | 'completo' },
) {
  const modo = {
    ligado: true,
    config: jest.fn().mockResolvedValue(CONFIG_MODO_PADRAO),
    fluxoDoConsultor: jest.fn().mockResolvedValue(o.fluxo ?? 'simples'),
  };
  const configs = {
    checklist: jest.fn().mockResolvedValue(o.cfg ?? CONFIG_CHECKLIST.padrao),
    checkin: jest.fn().mockResolvedValue({ raio_checkin_m: 200 }),
  };
  return new VisitsService(
    p as unknown as PrismaService,
    { abertaOuFalha: jest.fn().mockResolvedValue(JORNADA) } as unknown as JourneysService,
    { similar: jest.fn().mockResolvedValue([]) } as unknown as PlacesService,
    {
      put: jest.fn().mockResolvedValue(undefined),
      get: jest.fn(),
      remove: jest.fn().mockResolvedValue(undefined),
    } as unknown as PhotoStorage,
    false,
    modo as unknown as ModoCampoService,
    undefined,
    configs as unknown as RotasConfigService,
    { checklist: o.checklist, breaks: false },
  );
}
const dto = (body: unknown) =>
  pipe.transform(body, { type: 'body', metatype: AnswersDto }) as Promise<AnswersDto>;
const dataDo = (m: jest.Mock, n = 0) => (m.mock.calls[n]![0] as { data: Record<string, unknown> }).data;
const checkinDto = (over: Partial<CheckinDto> = {}): CheckinDto =>
  ({ client_id: CLIENT, lead_id: LEAD, ...POS, ...over }) as CheckinDto;

describe('flag desligada (produção hoje)', () => {
  it('check-in não grava foto; rascunho com checklist não nulo = 422 CHECKLIST_DISABLED sem gravar; null passa', async () => {
    const p = fakePrisma({ ...LINHA });
    const s = servico(p, { checklist: false });
    p.field_visits.findFirst.mockResolvedValueOnce(null);
    await s.checkin(C, checkinDto(), JPEG, AGORA);
    expect(dataDo(p.field_visits.create)).not.toHaveProperty('checklist');
    await expect(
      s.saveAnswers(
        C,
        CLIENT,
        await dto({ result: 'ja_usa', checklist: [{ id: 'apresentacao', done: true }] }),
        AGORA,
      ),
    ).rejects.toMatchObject({
      status: 422,
      response: { code: 'CHECKLIST_DISABLED' },
    });
    expect(p.field_visits.update).not.toHaveBeenCalled();
    const v = await s.saveAnswers(C, CLIENT, await dto({ result: 'ja_usa', checklist: null }), AGORA);
    expect(dataDo(p.field_visits.update)).not.toHaveProperty('checklist');
    expect(v).not.toHaveProperty('checklist');
  });
  it('foto gravada quando a flag estava ligada NÃO cobra nem aparece depois de desligar', async () => {
    const p = fakePrisma({
      ...LINHA,
      result: 'ja_usa',
      freela_status: 'ja_usa',
      needs_followup: false,
      checklist: foto('todas'),
    });
    const v = await servico(p, { checklist: false }).checkout(C, CLIENT, POS, AGORA);
    expect(v).not.toHaveProperty('checklist');
    expect(p.field_visits.updateMany).toHaveBeenCalled();
    expect(String(dataDo(p.lead_events.create).text)).not.toContain('Roteiro');
  });
});

describe('flag ligada', () => {
  it('check-in: foto com a configuração do instante, só nos fluxos configurados', async () => {
    const p = fakePrisma({ ...LINHA });
    p.field_visits.findFirst.mockResolvedValue(null);
    await servico(p, { checklist: true }).checkin(C, checkinDto(), JPEG, AGORA);
    expect(dataDo(p.field_visits.create).checklist).toEqual({
      required: 'nao',
      items: ETAPAS_PADRAO.map((e) => ({ ...e, done: false, note: null })),
    });

    const p2 = fakePrisma({ ...LINHA });
    p2.field_visits.findFirst.mockResolvedValue(null);
    await servico(p2, {
      checklist: true,
      cfg: { ...CONFIG_CHECKLIST.padrao, checklist_fluxos: ['completo'] },
    }).checkin(C, checkinDto(), JPEG, AGORA);
    expect(dataDo(p2.field_visits.create)).not.toHaveProperty('checklist');
  });

  it('rascunho mescla as marcas na foto; id desconhecido ignorado; sem foto o campo é ignorado', async () => {
    const p = fakePrisma({ ...LINHA, checklist: foto('nao') });
    const s = servico(p, { checklist: true });
    await s.saveAnswers(
      C,
      CLIENT,
      await dto({
        checklist: [
          { id: 'apresentacao', done: true, note: ' ok ' },
          { id: 'velha', done: true },
        ],
      }),
      AGORA,
    );
    const ck = dataDo(p.field_visits.update).checklist as {
      items: { id: string; done: boolean; note: string | null }[];
    };
    expect(ck.items.map((i) => [i.id, i.done, i.note])).toEqual([
      ['apresentacao', true, 'ok'],
      ['entender_negocio', false, null],
      ['identificar_necessidade', false, null],
    ]);
    const p2 = fakePrisma({ ...LINHA, checklist: null });
    await servico(p2, { checklist: true }).saveAnswers(
      C,
      CLIENT,
      await dto({ result: 'ja_usa', checklist: [{ id: 'apresentacao', done: true }] }),
      AGORA,
    );
    expect(dataDo(p2.field_visits.update)).not.toHaveProperty('checklist');
  });

  it('não obrigatório (padrão Lovable): o "1 toque" do simples conclui igual; o CRM leva só a contagem', async () => {
    const p = fakePrisma({
      ...LINHA,
      result: 'ja_usa',
      freela_status: 'ja_usa',
      needs_followup: false,
      checklist: foto('nao'),
    });
    const v = await servico(p, { checklist: true }).checkout(C, CLIENT, POS, AGORA);
    expect(p.field_visits.updateMany).toHaveBeenCalled();
    expect(String(dataDo(p.lead_events.create).text)).toMatch(/\. Roteiro da conversa: 0 de 3 etapas\.$/);
    expect(v.checklist).toMatchObject({ required: 'nao', done: 0, total: 3 });
  });

  it('obrigatório na FOTO: falta entra no fim do 422 e no missing; marcado tudo, conclui', async () => {
    const linha = {
      ...LINHA,
      result: 'ja_usa',
      freela_status: 'ja_usa',
      needs_followup: false,
      checklist: foto('todas'),
    };
    const p = fakePrisma(linha);
    await expect(servico(p, { checklist: true }).checkout(C, CLIENT, POS, AGORA)).rejects.toMatchObject({
      status: 422,
      response: {
        code: 'ANSWERS_INCOMPLETE',
        message: 'Falta responder: roteiro da visita (etapas 1, 2, 3).',
      },
    });
    expect(p.field_visits.updateMany).not.toHaveBeenCalled();
    const semResultado = fakePrisma({ ...LINHA, checklist: foto('todas', 2) });
    await expect(
      servico(semResultado, { checklist: true }).checkout(C, CLIENT, POS, AGORA),
    ).rejects.toMatchObject({
      response: { message: 'Falta responder: resultado da visita, roteiro da visita (etapas 1, 2).' },
    });
    const marcado = {
      ...linha,
      checklist: { required: 'todas', items: foto('todas').items.map((i) => ({ ...i, done: true })) },
    };
    const p3 = fakePrisma(marcado);
    await servico(p3, { checklist: true }).checkout(C, CLIENT, POS, AGORA);
    expect(p3.field_visits.updateMany).toHaveBeenCalled();
  });

  it('obrigatoriedade lida da foto: config virou "todas" depois do check-in (foto "nao") não trava; visita sem foto (fila de antes da flag) passa', async () => {
    const cfgTodas = { ...CONFIG_CHECKLIST.padrao, checklist_obrigatorio: 'todas' as const };
    for (const ck of [foto('nao'), null]) {
      const p = fakePrisma({
        ...LINHA,
        result: 'ja_usa',
        freela_status: 'ja_usa',
        needs_followup: false,
        checklist: ck,
      });
      await servico(p, { checklist: true, cfg: cfgTodas }).checkout(C, CLIENT, POS, AGORA);
      expect(p.field_visits.updateMany).toHaveBeenCalled();
    }
  });

  it('fluxo completo: o eco inteiro de answers (com result: null) e checklist: null não dão 422; marcas valem nos dois fluxos', async () => {
    const p = fakePrisma({ ...LINHA, flow: 'completo', checklist: foto('nao') });
    const s = servico(p, { checklist: true, fluxo: 'completo' });
    await s.saveAnswers(
      C,
      CLIENT,
      await dto({ ...VAZIA, interlocutor_name: 'Maria', checklist: null }),
      AGORA,
    );
    expect(dataDo(p.field_visits.update)).toMatchObject({ interlocutor_name: 'Maria' });
    expect(dataDo(p.field_visits.update)).not.toHaveProperty('checklist');
    await s.saveAnswers(
      C,
      CLIENT,
      await dto({
        ...VAZIA,
        interlocutor_name: 'Maria',
        checklist: [
          { id: 'fechamento', done: true },
          { id: 'entender_negocio', done: true },
        ],
      }),
      AGORA,
    );
    const ck = dataDo(p.field_visits.update, 1).checklist as { items: { done: boolean }[] };
    expect(ck.items.map((i) => i.done)).toEqual([false, true, false]);
  });

  it('DTO: marca com campo a mais ou nota longa é recusada pela validação global', async () => {
    await expect(dto({ checklist: [{ id: 'a', done: true, extra: 1 }] })).rejects.toBeDefined();
    await expect(dto({ checklist: [{ id: 'a', note: 'x'.repeat(201) }] })).rejects.toBeDefined();
    await expect(dto({ checklist: [{ id: 'x'.repeat(41) }] })).rejects.toBeDefined();
    await expect(dto({ checklist: [{ id: 'a' }] })).resolves.toBeDefined();
  });
});
