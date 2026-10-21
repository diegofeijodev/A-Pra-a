import { ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CampoConsultant } from '../../../common/auth/campo-consultant';
import type { PrismaService } from '../../../common/database/prisma.service';
import type { CheckinDto } from '../dto/campo.dto';
import type { JourneysService } from '../journeys.service';
import type { PhotoStorage } from '../photo-storage';
import type { PlacesService } from '../places.service';
import { VisitsService } from '../visits.service';

const CONS = '44444444-4444-4444-8444-444444444444';
const OUTRO = '66666666-6666-4666-8666-666666666666';
const PRACA = '00000000-0000-4000-8000-0000000000aa';
const LEAD = '99999999-9999-4999-8999-999999999999';
const CLIENT = '77777777-7777-4777-8777-777777777777';
const C: CampoConsultant = { id: CONS, name: 'Ana Souza', email: 'ana@exemplo.com', praca_id: PRACA, must_change_password: false };
const AGORA = new Date('2026-10-08T15:00:00.000Z');
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const HEIC = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypheic')]);

const JORNADA = { id: 'j1', day: '2026-10-08', started_at: new Date('2026-10-08T12:00:00.000Z') };

const RESPOSTAS = {
  interlocutor_name: 'João',
  interlocutor_role: 'dono',
  freela_status: 'cadastrou_qr',
  interest: 'alto',
  open_vagas: 1,
  vaga_roles: ['Garçom'],
  freelas_per_week: 3,
  channels: ['Grupos de WhatsApp'],
  channel_other: null,
  needs_followup: true,
  followup_what: 'Ligar sexta',
  followup_date: '2026-10-10',
  notes: null,
};

const VISITA = {
  id: 'v1',
  client_id: CLIENT,
  journey_id: 'j1',
  consultant_id: CONS,
  lead_id: LEAD,
  checkin_at: new Date('2026-10-08T14:00:00.000Z'),
  checkin_lat: -19.9245,
  checkin_lng: -43.9352,
  checkin_accuracy: 10,
  distance_m: null,
  far_from_place: false,
  photo_key: `campo/${CONS}/2026-10-08/v1.jpg`,
  photo_bytes: 6,
  checkout_at: null as Date | null,
  checkout_lat: null,
  checkout_lng: null,
  auto_closed: false,
  clock_adjusted: false,
  ...RESPOSTAS,
  lead: { name: 'Bar do Mercado', possible_dup: false },
};

const POS = { at: '2026-10-08T14:59:00.000Z', lat: -19.9245, lng: -43.9352, accuracy: 12 };
const checkinDto = (over: Partial<CheckinDto> = {}): CheckinDto => ({ client_id: CLIENT, ...POS, ...over }) as CheckinDto;

function fakePrisma() {
  const p = {
    $transaction: jest.fn(),
    field_visits: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      findUniqueOrThrow: jest.fn().mockResolvedValue(VISITA),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    field_points: { create: jest.fn().mockResolvedValue({}) },
    leads: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: LEAD, stage: 1 }),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
    },
    lead_events: { create: jest.fn().mockResolvedValue({}) },
    pracas: { findUnique: jest.fn().mockResolvedValue({ cobertura_cidade: 'Belo Horizonte' }) },
  };
  p.$transaction.mockImplementation(async (arg: unknown) =>
    Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => Promise<unknown>)(p),
  );
  return p;
}

function montar(p: ReturnType<typeof fakePrisma>, rotas = false) {
  const journeys = { abertaOuFalha: jest.fn().mockResolvedValue(JORNADA) };
  const places = { similar: jest.fn().mockResolvedValue([]) };
  const fotos = { put: jest.fn().mockResolvedValue(undefined), get: jest.fn(), remove: jest.fn().mockResolvedValue(undefined) };
  const s = new VisitsService(
    p as unknown as PrismaService,
    journeys as unknown as JourneysService,
    places as unknown as PlacesService,
    fotos as unknown as PhotoStorage,
    rotas,
  );
  return { s, journeys, places, fotos };
}

const dataDo = (m: jest.Mock, n = 0) => (m.mock.calls[n]![0] as { data: Record<string, unknown> }).data;

describe('VisitsService.checkin', () => {
  it('estabelecimento novo: cria o lead "visita de campo" com a posição, guarda a foto e grava visita + ponto', async () => {
    const p = fakePrisma();
    const { s, fotos } = montar(p);

    await s.checkin(C, checkinDto({ new_place: { name: ' Bar Novo ', address: ' Rua A, 1 ' } }), JPEG, AGORA);

    expect(dataDo(p.leads.create)).toMatchObject({
      praca_id: PRACA,
      name: 'Bar Novo',
      address: 'Rua A, 1',
      city: 'Belo Horizonte',
      origem: 'visita de campo',
      classe: 'alvo',
      stage: 1,
      entered_at: '2026-10-08',
      lat: POS.lat,
      lng: POS.lng,
      possible_dup: false,
    });
    const visita = dataDo(p.field_visits.create);
    expect(visita).toMatchObject({
      client_id: CLIENT,
      journey_id: 'j1',
      consultant_id: CONS,
      lead_id: dataDo(p.leads.create).id,
      photo_bytes: JPEG.length,
      distance_m: null,
      far_from_place: false,
      clock_adjusted: false,
    });
    expect(visita.photo_key).toMatch(new RegExp(`^campo/${CONS}/2026-10-08/[0-9a-f-]{36}\\.jpg$`));
    expect(fotos.put).toHaveBeenCalledWith(visita.photo_key, JPEG, 'image/jpeg');
    expect(dataDo(p.field_points.create)).toMatchObject({ kind: 'checkin', journey_id: 'j1' });
  });

  it('sem confirmar que é novo (check-in sem sinal) e com parecido a 100 m: cria marcando possible_dup', async () => {
    const p = fakePrisma();
    const { s, places } = montar(p);
    places.similar.mockResolvedValue([{ id: 'x', name: 'Bar do Zé', distance_m: 40 }]);

    await s.checkin(C, checkinDto({ new_place: { name: 'Bar do Zé Moema' } }), JPEG, AGORA);

    expect(dataDo(p.leads.create)).toMatchObject({ possible_dup: true });
  });

  it('check-in sem confirm_new usa a busca completa de parecidos (places.similar) e marca possible_dup', async () => {
    const p = fakePrisma();
    const { s, places } = montar(p);
    places.similar.mockResolvedValue([{ id: 'longe', name: 'Bar do Zé', distance_m: 95 }]);
    await s.checkin(C, checkinDto({ new_place: { name: 'Bar do Zé Moema' } }), JPEG, AGORA);
    expect(places.similar).toHaveBeenCalledWith(C, { name: 'Bar do Zé Moema', lat: POS.lat, lng: POS.lng });
    expect(dataDo(p.leads.create)).toMatchObject({ possible_dup: true });
  });

  it('"é outro" confirmado: nem procura parecido', async () => {
    const p = fakePrisma();
    const { s, places } = montar(p);
    await s.checkin(C, checkinDto({ new_place: { name: 'Bar do Zé Moema' }, confirm_new: true }), JPEG, AGORA);
    expect(places.similar).not.toHaveBeenCalled();
  });

  it('estabelecimento da praça a mais de 200 m: marca "longe do local" (não bloqueia)', async () => {
    const p = fakePrisma();
    p.leads.findFirst.mockResolvedValue({ id: LEAD, lat: -19.9225, lng: -43.9352 });

    await montar(p).s.checkin(C, checkinDto({ lead_id: LEAD }), JPEG, AGORA);

    expect(p.leads.findFirst).toHaveBeenCalledWith({
      where: { id: LEAD, praca_id: PRACA },
      select: { id: true, lat: true, lng: true },
    });
    expect(dataDo(p.field_visits.create)).toMatchObject({ lead_id: LEAD, distance_m: 222, far_from_place: true });
    expect(p.leads.create).not.toHaveBeenCalled();
  });

  it('raio do check-in configurável (§23.1, L0): 222 m com raio 250 não é longe; com o padrão (200) é', async () => {
    const p = fakePrisma();
    p.leads.findFirst.mockResolvedValue({ id: LEAD, lat: -19.9225, lng: -43.9352 });
    const { journeys, places, fotos } = montar(p);
    const configs = { checkin: jest.fn().mockResolvedValue({ raio_checkin_m: 250 }) };
    const s = new VisitsService(
      p as unknown as PrismaService,
      journeys as unknown as JourneysService,
      places as unknown as PlacesService,
      fotos as unknown as PhotoStorage,
      false,
      undefined,
      undefined,
      configs as never,
    );
    await s.checkin(C, checkinDto({ lead_id: LEAD }), JPEG, AGORA);
    expect(dataDo(p.field_visits.create)).toMatchObject({ distance_m: 222, far_from_place: false });
    const p2 = fakePrisma();
    p2.leads.findFirst.mockResolvedValue({ id: LEAD, lat: -19.9225, lng: -43.9352 });
    const padrao = { checkin: jest.fn().mockResolvedValue({ raio_checkin_m: 200 }) };
    const m2 = montar(p2);
    await new VisitsService(p2 as unknown as PrismaService, m2.journeys as unknown as JourneysService, m2.places as unknown as PlacesService, m2.fotos as unknown as PhotoStorage, false, undefined, undefined, padrao as never).checkin(C, checkinDto({ lead_id: LEAD }), JPEG, AGORA);
    expect(dataDo(p2.field_visits.create)).toMatchObject({ distance_m: 222, far_from_place: true });
  });

  it('estabelecimento de outra praça = 404', async () => {
    await expect(montar(fakePrisma()).s.checkin(C, checkinDto({ lead_id: LEAD }), JPEG, AGORA)).rejects.toMatchObject({
      response: { code: 'NOT_FOUND' },
    });
  });

  it('HEIC do iPhone (pelos bytes) = 400 INVALID_FILE_TYPE, nada guardado', async () => {
    const p = fakePrisma();
    const { s, fotos } = montar(p);
    await expect(s.checkin(C, checkinDto({ lead_id: LEAD }), HEIC, AGORA)).rejects.toMatchObject({
      response: { code: 'INVALID_FILE_TYPE' },
    });
    expect(fotos.put).not.toHaveBeenCalled();
  });

  it('reenvio com o mesmo client_id devolve a visita, sem guardar foto de novo', async () => {
    const p = fakePrisma();
    p.field_visits.findUnique.mockResolvedValue(VISITA);
    const { s, fotos } = montar(p);

    expect((await s.checkin(C, checkinDto({ lead_id: LEAD }), JPEG, AGORA)).id).toBe('v1');
    expect(fotos.put).not.toHaveBeenCalled();
  });

  it('client_id de outro consultor = 409 CLIENT_ID_IN_USE', async () => {
    const p = fakePrisma();
    p.field_visits.findUnique.mockResolvedValue({ ...VISITA, consultant_id: OUTRO });
    await expect(montar(p).s.checkin(C, checkinDto({ lead_id: LEAD }), JPEG, AGORA)).rejects.toMatchObject({
      response: { code: 'CLIENT_ID_IN_USE' },
    });
  });

  it('lead_id e new_place juntos (ou nenhum) = 400', async () => {
    const { s } = montar(fakePrisma());
    await expect(s.checkin(C, checkinDto(), JPEG, AGORA)).rejects.toMatchObject({ response: { code: 'VALIDATION_ERROR' } });
    await expect(
      s.checkin(C, checkinDto({ lead_id: LEAD, new_place: { name: 'X X' } }), JPEG, AGORA),
    ).rejects.toMatchObject({ response: { code: 'VALIDATION_ERROR' } });
  });

  it('com visita aberta = 409 VISIT_ALREADY_OPEN', async () => {
    const p = fakePrisma();
    p.field_visits.findFirst.mockResolvedValue({ id: 'aberta' });
    await expect(montar(p).s.checkin(C, checkinDto({ lead_id: LEAD }), JPEG, AGORA)).rejects.toMatchObject({
      response: { code: 'VISIT_ALREADY_OPEN' },
    });
  });

  it('corrida perdida no índice "uma visita aberta": apaga a foto órfã e responde 409', async () => {
    const p = fakePrisma();
    p.leads.findFirst.mockResolvedValue({ id: LEAD, lat: null, lng: null });
    p.$transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: '5.22.0' }),
    );
    const { s, fotos } = montar(p);

    await expect(s.checkin(C, checkinDto({ lead_id: LEAD }), JPEG, AGORA)).rejects.toMatchObject({
      response: { code: 'VISIT_ALREADY_OPEN' },
    });
    expect(fotos.remove).toHaveBeenCalledWith(dataDo(p.field_visits.create).photo_key);
  });
});

describe('VisitsService.checkin — parada do roteiro (contrato §23.3)', () => {
  const comLead = (p: ReturnType<typeof fakePrisma>) => {
    p.leads.findFirst.mockResolvedValue({ id: LEAD, lat: -19.9245, lng: -43.9352 });
    (p as Record<string, unknown>).field_route_stops = { updateMany: jest.fn().mockResolvedValue({ count: 1 }) };
    return (p as unknown as { field_route_stops: { updateMany: jest.Mock } }).field_route_stops;
  };

  it('flag ligada: marca a parada pendente/adiada do dia DA JORNADA como visitada, na mesma transação, só do próprio consultor', async () => {
    const p = fakePrisma();
    const paradas = comLead(p);
    await montar(p, true).s.checkin(C, checkinDto({ lead_id: LEAD }), JPEG, AGORA);
    expect(paradas.updateMany).toHaveBeenCalledWith({
      where: {
        lead_id: LEAD,
        day: JORNADA.day,
        status: { in: ['pendente', 'adiada'] },
        route: { consultant_id: CONS, status: 'ativa' },
      },
      data: expect.objectContaining({ status: 'visitada', visit_id: expect.any(String) }),
    });
    // vai no array da transação, junto com a visita (nada de estado intermediário)
    const ops = p.$transaction.mock.calls[0]![0] as unknown[];
    expect(ops).toHaveLength(3);
  });

  it('flag desligada: nenhuma operação extra (o bloco A fica idêntico)', async () => {
    const p = fakePrisma();
    const paradas = comLead(p);
    await montar(p, false).s.checkin(C, checkinDto({ lead_id: LEAD }), JPEG, AGORA);
    expect(paradas.updateMany).not.toHaveBeenCalled();
    expect(p.$transaction.mock.calls[0]![0] as unknown[]).toHaveLength(2);
  });

  it('lugar novo (new_place) não mexe em roteiro', async () => {
    const p = fakePrisma();
    const paradas = comLead(p);
    await montar(p, true).s.checkin(C, checkinDto({ new_place: { name: 'Bar Novo' } }), JPEG, AGORA);
    expect(paradas.updateMany).not.toHaveBeenCalled();
  });
});

describe('VisitsService.saveAnswers', () => {
  it('rascunho parcial: apara texto, null limpa, lista null vira []', async () => {
    const p = fakePrisma();
    p.field_visits.findFirst.mockResolvedValue({ ...VISITA, ...{ interlocutor_name: null } });

    await montar(p).s.saveAnswers(C, CLIENT, { interlocutor_name: '  Maria  ', notes: null, vaga_roles: null as unknown as string[] }, AGORA);

    expect(p.field_visits.findFirst).toHaveBeenCalledWith({
      where: { consultant_id: CONS, OR: [{ id: CLIENT }, { client_id: CLIENT }] },
      include: { lead: { select: { name: true, possible_dup: true } } },
    });
    expect(p.field_visits.update).toHaveBeenCalledWith({
      where: { id: 'v1' },
      data: { interlocutor_name: 'Maria', notes: null, vaga_roles: [] },
    });
  });

  it('visita encerrada = 409 VISIT_CLOSED', async () => {
    const p = fakePrisma();
    p.field_visits.findFirst.mockResolvedValue({ ...VISITA, checkout_at: new Date() });
    await expect(montar(p).s.saveAnswers(C, CLIENT, { interest: 'alto' }, AGORA)).rejects.toMatchObject({
      response: { code: 'VISIT_CLOSED' },
    });
  });

  it('ref malformada ou de outro consultor = 404', async () => {
    const p = fakePrisma();
    await expect(montar(p).s.saveAnswers(C, 'nao-e-uuid', {}, AGORA)).rejects.toMatchObject({ response: { code: 'NOT_FOUND' } });
    await expect(montar(p).s.saveAnswers(C, CLIENT, {}, AGORA)).rejects.toMatchObject({ response: { code: 'NOT_FOUND' } });
  });
});

describe('VisitsService.checkout — CRM numa transação', () => {
  it('questionário incompleto = 422 ANSWERS_INCOMPLETE com a lista', async () => {
    const p = fakePrisma();
    p.field_visits.findFirst.mockResolvedValue({ ...VISITA, interest: null, followup_date: null });
    await expect(montar(p).s.checkout(C, CLIENT, POS, AGORA)).rejects.toMatchObject({
      status: 422,
      response: { code: 'ANSWERS_INCOMPLETE', message: 'Falta responder: interesse, data do retorno.' },
    });
  });

  it('checkout feito às 23:50 do dia D e enviado às 00:20 de D+1: o retorno marcado para D vale (hoje = dia do carimbo)', async () => {
    const p = fakePrisma();
    p.field_visits.findFirst.mockResolvedValue({ ...VISITA, followup_date: '2026-10-08' });
    const depoisDaMeiaNoite = new Date('2026-10-09T03:20:00.000Z');
    const pos = { ...POS, at: '2026-10-09T02:50:00.000Z' };

    await expect(montar(p).s.checkout(C, CLIENT, pos, depoisDaMeiaNoite)).resolves.toBeDefined();
    expect(p.field_visits.updateMany).toHaveBeenCalled();
  });

  it('lead em "Lead novo" vai para "Conversa aberta"; decisor, retorno, contato e evento "visit" do consultor', async () => {
    const p = fakePrisma();
    p.field_visits.findFirst.mockResolvedValue(VISITA);

    await montar(p).s.checkout(C, CLIENT, POS, AGORA);

    expect(p.field_visits.updateMany).toHaveBeenCalledWith({
      where: { id: 'v1', checkout_at: null, auto_closed: false },
      data: { checkout_at: new Date(POS.at), checkout_lat: POS.lat, checkout_lng: POS.lng },
    });
    expect(p.leads.update).toHaveBeenCalledWith({
      where: { id: LEAD },
      data: {
        decisor: 'João',
        decisor_role: 'Dono',
        last_contact_at: new Date(POS.at),
        stage: 3,
        stage_since: '2026-10-08',
        next_step_what: 'Ligar sexta',
        next_step_date: '2026-10-10',
      },
    });
    expect(dataDo(p.lead_events.create)).toMatchObject({
      lead_id: LEAD,
      kind: 'visit',
      author_label: 'Consultor: Ana Souza',
      stage_to: 3,
      at: new Date(POS.at),
    });
    expect(dataDo(p.lead_events.create).text).toContain('Visita de campo — atendeu: João (Dono)');
    expect(dataDo(p.field_points.create)).toMatchObject({ kind: 'checkout' });
  });

  it('lead de "Reunião marcada" (4) em diante mantém a etapa; sem retorno não mexe no próximo passo', async () => {
    const p = fakePrisma();
    p.field_visits.findFirst.mockResolvedValue({ ...VISITA, needs_followup: false, followup_what: null, followup_date: null });
    p.leads.findUniqueOrThrow.mockResolvedValue({ id: LEAD, stage: 4 });

    await montar(p).s.checkout(C, CLIENT, POS, AGORA);

    const data = (p.leads.update.mock.calls[0]![0] as { data: Record<string, unknown> }).data;
    expect(data).not.toHaveProperty('stage');
    expect(data).not.toHaveProperty('next_step_what');
    expect(dataDo(p.lead_events.create)).toMatchObject({ stage_to: null });
  });

  it('reenvio de checkout já feito: 200 com a visita, nada gravado de novo', async () => {
    const p = fakePrisma();
    p.field_visits.findFirst.mockResolvedValue({ ...VISITA, checkout_at: new Date('2026-10-08T14:59:00.000Z') });

    const v = await montar(p).s.checkout(C, CLIENT, POS, AGORA);

    expect(v.id).toBe('v1');
    expect(p.$transaction).not.toHaveBeenCalled();
    expect(p.lead_events.create).not.toHaveBeenCalled();
  });

  it('dois checkouts ao mesmo tempo: o update condicional deixa UM evento só', async () => {
    const p = fakePrisma();
    p.field_visits.findFirst.mockResolvedValue(VISITA);
    p.field_visits.updateMany.mockResolvedValue({ count: 0 });

    await montar(p).s.checkout(C, CLIENT, POS, AGORA);

    expect(p.lead_events.create).not.toHaveBeenCalled();
    expect(p.leads.update).not.toHaveBeenCalled();
  });

  it('dois checkouts ao mesmo tempo (de verdade): um grava, o outro perde a corrida; os dois recebem 200 e há UM evento', async () => {
    const p = fakePrisma();
    p.field_visits.findFirst.mockResolvedValue(VISITA);
    // Simula o banco: só o primeiro updateMany condicional acha a linha aberta.
    let fechada = false;
    p.field_visits.updateMany.mockImplementation(async () => {
      if (fechada) return { count: 0 };
      fechada = true;
      return { count: 1 };
    });
    const { s } = montar(p);

    const [a, b] = await Promise.all([s.checkout(C, CLIENT, POS, AGORA), s.checkout(C, CLIENT, POS, AGORA)]);

    expect(a.id).toBe('v1');
    expect(b.id).toBe('v1');
    expect(p.lead_events.create).toHaveBeenCalledTimes(1);
    expect(p.leads.update).toHaveBeenCalledTimes(1);
  });

  it('visita fechada à meia-noite = 409 VISIT_AUTO_CLOSED', async () => {
    const p = fakePrisma();
    p.field_visits.findFirst.mockResolvedValue({ ...VISITA, auto_closed: true });
    await expect(montar(p).s.checkout(C, CLIENT, POS, AGORA)).rejects.toMatchObject({
      response: { code: 'VISIT_AUTO_CLOSED' },
    });
  });
});

describe('VisitsService.photo', () => {
  const FOTO = { bytes: JPEG, mime: 'image/jpeg' };

  it('devolve os bytes da foto da própria visita (por id ou client_id)', async () => {
    const p = fakePrisma();
    p.field_visits.findFirst.mockResolvedValue(VISITA);
    const { s, fotos } = montar(p);
    fotos.get.mockResolvedValue(FOTO);

    expect(await s.photo(C, CLIENT)).toBe(FOTO);
    expect(fotos.get).toHaveBeenCalledWith(VISITA.photo_key);
  });

  it('objeto ausente = 404 NOT_FOUND', async () => {
    const p = fakePrisma();
    p.field_visits.findFirst.mockResolvedValue(VISITA);
    const { s, fotos } = montar(p);
    fotos.get.mockResolvedValue(null);
    await expect(s.photo(C, CLIENT)).rejects.toMatchObject({ response: { code: 'NOT_FOUND' } });
  });

  it('falha do armazenamento = 502 PHOTO_STORAGE_ERROR (não 500 cru)', async () => {
    const p = fakePrisma();
    p.field_visits.findFirst.mockResolvedValue(VISITA);
    const { s, fotos } = montar(p);
    fotos.get.mockRejectedValue(new Error('socket hang up'));
    await expect(s.photo(C, CLIENT)).rejects.toMatchObject({ status: 502, response: { code: 'PHOTO_STORAGE_ERROR' } });
  });

  it('503 PHOTO_STORAGE_NOT_CONFIGURED do armazenamento passa intacto', async () => {
    const p = fakePrisma();
    p.field_visits.findFirst.mockResolvedValue(VISITA);
    const { s, fotos } = montar(p);
    fotos.get.mockRejectedValue(new ServiceUnavailableException({ code: 'PHOTO_STORAGE_NOT_CONFIGURED', message: 'x' }));
    await expect(s.photo(C, CLIENT)).rejects.toMatchObject({ status: 503, response: { code: 'PHOTO_STORAGE_NOT_CONFIGURED' } });
  });

  it('visita de outro consultor ou ref malformada = 404', async () => {
    const { s } = montar(fakePrisma());
    await expect(s.photo(C, 'nao-e-uuid')).rejects.toMatchObject({ response: { code: 'NOT_FOUND' } });
    await expect(s.photo(C, CLIENT)).rejects.toMatchObject({ response: { code: 'NOT_FOUND' } });
  });
});

describe('P0 §30 — fechado, motivo de recusa, hora e telefone', () => {
  const salvar = async (visita: Record<string, unknown>, dto: Record<string, unknown>) => {
    const p = fakePrisma();
    p.field_visits.findFirst.mockResolvedValue({ ...VISITA, ...visita });
    await montar(p).s.saveAnswers(C, CLIENT, dto as never, AGORA);
    return dataDo(p.field_visits.update);
  };

  it('checkout "fechado" sem questionário: não grava decisor/contato/estágio e o evento do CRM é "note"', async () => {
    const p = fakePrisma();
    p.field_visits.findFirst.mockResolvedValue({
      ...VISITA,
      outcome: 'fechado',
      interlocutor_name: null,
      interlocutor_role: null,
      freela_status: null,
      interest: null,
      open_vagas: null,
      vaga_roles: [],
      freelas_per_week: null,
      channels: [],
      needs_followup: null,
      followup_what: null,
      followup_date: null,
    });

    await montar(p).s.checkout(C, CLIENT, POS, AGORA);

    expect(p.field_visits.updateMany).toHaveBeenCalled();
    expect(p.leads.update).not.toHaveBeenCalled();
    expect(dataDo(p.lead_events.create)).toMatchObject({ kind: 'note', stage_to: null, text: 'Visita de campo — estabelecimento fechado.' });
    expect(dataDo(p.field_points.create)).toMatchObject({ kind: 'checkout' });
  });

  it('conversa continua exigindo o questionário (nada muda para o que existe)', async () => {
    const p = fakePrisma();
    p.field_visits.findFirst.mockResolvedValue({ ...VISITA, outcome: 'conversa', interest: null });
    await expect(montar(p).s.checkout(C, CLIENT, POS, AGORA)).rejects.toMatchObject({ status: 422 });
  });

  it('motivo de recusa: vale com interesse "nenhum"; a nota só com "outro"', async () => {
    expect(await salvar({ interest: 'nenhum' }, { refusal_reason: 'preco', refusal_note: 'x' })).toMatchObject({ refusal_reason: 'preco' });
    expect(await salvar({ interest: 'nenhum' }, { refusal_reason: 'preco', refusal_note: 'x' })).not.toHaveProperty('refusal_note', 'x');
    expect(await salvar({ interest: 'nenhum' }, { refusal_reason: 'outro', refusal_note: ' vai vender ' })).toMatchObject({ refusal_reason: 'outro', refusal_note: 'vai vender' });
  });

  it('PATCH parcial: mudar o interesse para "alto" limpa o motivo que já estava gravado', async () => {
    const d = await salvar({ interest: 'nenhum', refusal_reason: 'preco' }, { interest: 'alto' });
    expect(d).toMatchObject({ interest: 'alto', refusal_reason: null });
  });

  it('marcar "fechado" limpa motivo de recusa', async () => {
    expect(await salvar({ interest: 'nenhum', refusal_reason: 'preco' }, { outcome: 'fechado' })).toMatchObject({ outcome: 'fechado', refusal_reason: null });
  });

  it('hora do retorno só fica com retorno pedido; sem retorno vira null', async () => {
    expect(await salvar({ needs_followup: true }, { followup_time: '15:30' })).toMatchObject({ followup_time: '15:30' });
    expect(await salvar({ needs_followup: true, followup_time: '15:30' }, { needs_followup: false })).toMatchObject({ followup_time: null });
  });

  it('telefone do contato: guarda só dígitos; inválido = 400 sem repetir o número', async () => {
    expect(await salvar({}, { contact_phone: '(11) 98765-4321' })).toMatchObject({ contact_phone: '11987654321' });
    expect(await salvar({ contact_phone: '11987654321' }, { contact_phone: null })).toMatchObject({ contact_phone: null });
    const p = fakePrisma();
    p.field_visits.findFirst.mockResolvedValue(VISITA);
    const erro = await montar(p).s.saveAnswers(C, CLIENT, { contact_phone: '12345' } as never, AGORA).catch((e) => e);
    expect(erro).toMatchObject({ status: 400, response: { code: 'VALIDATION_ERROR' } });
    expect(JSON.stringify(erro.getResponse())).not.toContain('12345');
    expect(p.field_visits.update).not.toHaveBeenCalled();
  });

  it('o resumo do CRM nunca leva o telefone do contato', async () => {
    const p = fakePrisma();
    p.field_visits.findFirst.mockResolvedValue({ ...VISITA, contact_phone: '11987654321', followup_time: '15:30' });
    await montar(p).s.checkout(C, CLIENT, POS, AGORA);
    const texto = dataDo(p.lead_events.create).text as string;
    expect(texto).not.toContain('98765');
    expect(texto).toContain('às 15:30');
  });
});
