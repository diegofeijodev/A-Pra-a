import { Prisma } from '@prisma/client';
import type { CampoConsultant } from '../../../common/auth/campo-consultant';
import type { PrismaService } from '../../../common/database/prisma.service';
import { CONFIG_ALERTAS_PADRAO } from '../../../domain/alerta-rules';
import { CONFIG_ROTA_PADRAO } from '../../../domain/rota-rules';
import { CONFIG_MODO_PADRAO } from '../../../domain/modo-campo-rules';
import { JourneysService } from '../journeys.service';

const CONS = '44444444-4444-4444-8444-444444444444';
const OUTRO = '66666666-6666-4666-8666-666666666666';
const PRACA = '00000000-0000-4000-8000-0000000000aa';
const C: CampoConsultant = { id: CONS, name: 'Ana', email: 'ana@exemplo.com', praca_id: PRACA, must_change_password: false };
const CLIENT = '77777777-7777-4777-8777-777777777777';
const CLIENT2 = '88888888-8888-4888-8888-888888888888';
const AGORA = new Date('2026-10-08T15:00:00.000Z'); // 12:00 em Brasília

const JORNADA = {
  id: 'j1',
  consultant_id: CONS,
  client_id: CLIENT,
  day: '2026-10-08',
  started_at: new Date('2026-10-08T12:00:00.000Z'),
  start_lat: -19.9245,
  start_lng: -43.9352,
  start_accuracy: 10,
  ended_at: null as Date | null,
  end_lat: null as number | null,
  end_lng: null as number | null,
  end_accuracy: null as number | null,
  auto_closed: false,
};

const POS = { at: '2026-10-08T14:59:00.000Z', lat: -19.9245, lng: -43.9352, accuracy: 12 };

function fakePrisma() {
  const p = {
    $transaction: jest.fn(),
    field_journeys: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      findUniqueOrThrow: jest.fn().mockResolvedValue(JORNADA),
      create: jest.fn().mockResolvedValue(JORNADA),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    field_points: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({}),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    field_visits: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
  p.$transaction.mockImplementation(async (arg: unknown) =>
    Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => Promise<unknown>)(p),
  );
  return p;
}

const montar = (p: ReturnType<typeof fakePrisma>) => new JourneysService(p as unknown as PrismaService);
const dataDo = (m: jest.Mock, n = 0) => (m.mock.calls[n]![0] as { data: Record<string, unknown> }).data;

describe('JourneysService.start — roteiro automático', () => {
  it('depois de gravar a jornada, pede o roteiro com a posição do início', async () => {
    const p = fakePrisma();
    const rotas = { gerarAoIniciar: jest.fn().mockResolvedValue(undefined) };
    const s = new JourneysService(p as unknown as PrismaService, rotas as never);
    await s.start(C, { client_id: CLIENT, ...POS }, AGORA);
    expect(rotas.gerarAoIniciar).toHaveBeenCalledWith(C, { lat: POS.lat, lng: POS.lng }, AGORA);
    expect(p.field_journeys.create.mock.invocationCallOrder[0]).toBeLessThan(rotas.gerarAoIniciar.mock.invocationCallOrder[0]!);
  });

  it('reenvio do mesmo client_id não gera roteiro de novo', async () => {
    const p = fakePrisma();
    p.field_journeys.findUnique.mockResolvedValue(JORNADA);
    const rotas = { gerarAoIniciar: jest.fn() };
    await new JourneysService(p as unknown as PrismaService, rotas as never).start(C, { client_id: CLIENT, ...POS }, AGORA);
    expect(rotas.gerarAoIniciar).not.toHaveBeenCalled();
  });
});

describe('JourneysService.start', () => {
  it('abre a jornada com o dia de Brasília da hora do aparelho e grava o ponto de início', async () => {
    const p = fakePrisma();
    const j = await montar(p).start(C, { client_id: CLIENT, ...POS }, AGORA);

    expect(dataDo(p.field_journeys.create)).toMatchObject({
      consultant_id: CONS,
      client_id: CLIENT,
      day: '2026-10-08',
      started_at: new Date(POS.at),
    });
    expect(dataDo(p.field_points.create)).toMatchObject({ kind: 'start', clock_adjusted: false, lat: POS.lat });
    expect(j).toMatchObject({ id: 'j1', client_id: CLIENT, ended_at: null });
  });

  it('reenvio com o mesmo client_id devolve a mesma jornada, sem criar nada', async () => {
    const p = fakePrisma();
    p.field_journeys.findUnique.mockResolvedValue(JORNADA);

    const j = await montar(p).start(C, { client_id: CLIENT, ...POS }, AGORA);

    expect(j.id).toBe('j1');
    expect(p.field_journeys.create).not.toHaveBeenCalled();
  });

  it('outro client_id com jornada aberta = 409 JOURNEY_ALREADY_OPEN', async () => {
    const p = fakePrisma();
    p.field_journeys.findFirst.mockResolvedValue({ id: 'j1' });
    await expect(montar(p).start(C, { client_id: CLIENT2, ...POS }, AGORA)).rejects.toMatchObject({
      status: 409,
      response: { code: 'JOURNEY_ALREADY_OPEN' },
    });
  });

  it('client_id de outro consultor = 409 CLIENT_ID_IN_USE', async () => {
    const p = fakePrisma();
    p.field_journeys.findUnique.mockResolvedValue({ ...JORNADA, consultant_id: OUTRO });
    await expect(montar(p).start(C, { client_id: CLIENT, ...POS }, AGORA)).rejects.toMatchObject({
      response: { code: 'CLIENT_ID_IN_USE' },
    });
  });

  it('corrida de dois envios (índice único) devolve a jornada que ganhou', async () => {
    const p = fakePrisma();
    p.field_journeys.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(JORNADA);
    p.$transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: '5.22.0' }),
    );

    expect((await montar(p).start(C, { client_id: CLIENT, ...POS }, AGORA)).id).toBe('j1');
  });

  it('fecha a jornada esquecida de ontem ANTES de abrir a de hoje', async () => {
    const p = fakePrisma();
    await montar(p).start(C, { client_id: CLIENT, ...POS }, AGORA);
    expect((p.field_journeys.findMany.mock.calls[0]![0] as { where: unknown }).where).toEqual({
      ended_at: null,
      day: { lt: '2026-10-08' },
      consultant_id: CONS,
    });
  });
});

describe('JourneysService.addPoints', () => {
  it('sem jornada aberta = 409 NO_OPEN_JOURNEY', async () => {
    await expect(
      montar(fakePrisma()).addPoints(C, { points: [{ client_id: CLIENT, ...POS }] }, AGORA),
    ).rejects.toMatchObject({ response: { code: 'NO_OPEN_JOURNEY' } });
  });

  it('idempotente por client_id (no banco e dentro do lote); hora do futuro vira ajustada', async () => {
    const p = fakePrisma();
    p.field_journeys.findFirst.mockResolvedValue(JORNADA);
    p.field_points.findMany.mockResolvedValue([{ client_id: CLIENT }]);
    const futuro = { ...POS, at: '2026-10-08T16:00:00.000Z' };

    const r = await montar(p).addPoints(
      C,
      { points: [{ client_id: CLIENT, ...POS }, { client_id: CLIENT2, ...futuro }, { client_id: CLIENT2, ...futuro }] },
      AGORA,
    );

    expect(r).toEqual({ accepted: 1, duplicates: 2 });
    const linhas = (p.field_points.createMany.mock.calls[0]![0] as { data: Record<string, unknown>[] }).data;
    expect(linhas).toEqual([
      expect.objectContaining({ client_id: CLIENT2, kind: 'track', at: AGORA, clock_adjusted: true, journey_id: 'j1' }),
    ]);
  });
});

describe('JourneysService.end', () => {
  it('com visita aberta = 409 VISIT_OPEN', async () => {
    const p = fakePrisma();
    p.field_journeys.findFirst.mockResolvedValue(JORNADA);
    p.field_visits.count.mockResolvedValue(1);
    await expect(montar(p).end(C, POS, AGORA)).rejects.toMatchObject({ response: { code: 'VISIT_OPEN' } });
  });

  it('encerra uma vez só (update condicional) e grava o ponto de fim', async () => {
    const p = fakePrisma();
    p.field_journeys.findFirst.mockResolvedValue(JORNADA);

    await montar(p).end(C, POS, AGORA);

    expect(p.field_journeys.updateMany).toHaveBeenCalledWith({
      where: { id: 'j1', ended_at: null },
      data: { ended_at: new Date(POS.at), end_lat: POS.lat, end_lng: POS.lng, end_accuracy: POS.accuracy },
    });
    expect(dataDo(p.field_points.create)).toMatchObject({ kind: 'end' });
  });

  it('reenvio depois de encerrada (resposta perdida) devolve 200 com a jornada, sem gravar de novo', async () => {
    const p = fakePrisma();
    const encerrada = { ...JORNADA, ended_at: new Date('2026-10-08T14:55:00.000Z') };
    p.field_journeys.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(encerrada);

    const j = await montar(p).end(C, POS, AGORA);

    expect(j.ended_at).toBe('2026-10-08T14:55:00.000Z');
    expect(p.field_journeys.updateMany).not.toHaveBeenCalled();
  });

  it('sem jornada aberta nem encerrada há pouco = 409 NO_OPEN_JOURNEY', async () => {
    await expect(montar(fakePrisma()).end(C, POS, AGORA)).rejects.toMatchObject({
      response: { code: 'NO_OPEN_JOURNEY' },
    });
  });

  it('jornada encerrada há mais de 24 h não é devolvida no reenvio = 409 NO_OPEN_JOURNEY', async () => {
    const p = fakePrisma();
    const velha = { ...JORNADA, ended_at: new Date('2026-10-07T14:00:00.000Z') };
    p.field_journeys.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(velha);
    await expect(montar(p).end(C, POS, AGORA)).rejects.toMatchObject({ response: { code: 'NO_OPEN_JOURNEY' } });
  });
});

describe('JourneysService.closeStale — fechamento da meia-noite', () => {
  it('às 22h30 de Brasília (01h30 UTC do dia seguinte) a jornada de HOJE não é vencida', async () => {
    const p = fakePrisma();
    await montar(p).closeStale(new Date('2026-10-09T01:30:00.000Z'));
    expect((p.field_journeys.findMany.mock.calls[0]![0] as { where: unknown }).where).toEqual({
      ended_at: null,
      day: { lt: '2026-10-08' },
    });
  });

  it('fecha na hora do último ponto; visitas sem checkout ficam "sem checkout"', async () => {
    const p = fakePrisma();
    p.field_journeys.findMany.mockResolvedValue([
      { id: 'j1', started_at: new Date('2026-10-07T12:00:00.000Z'), points: [{ at: new Date('2026-10-07T21:10:00.000Z') }] },
      { id: 'j2', started_at: new Date('2026-10-07T13:00:00.000Z'), points: [] },
    ]);
    p.field_visits.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });

    const r = await montar(p).closeStale(new Date('2026-10-08T03:05:00.000Z'));

    expect(r).toEqual({ journeys: 2, visits: 1 });
    expect(p.field_visits.updateMany).toHaveBeenCalledWith({
      where: { journey_id: 'j1', checkout_at: null, auto_closed: false },
      data: { auto_closed: true },
    });
    expect(p.field_journeys.updateMany).toHaveBeenCalledWith({
      where: { id: 'j1', ended_at: null },
      data: { ended_at: new Date('2026-10-07T21:10:00.000Z'), auto_closed: true },
    });
    expect(p.field_journeys.updateMany).toHaveBeenCalledWith({
      where: { id: 'j2', ended_at: null },
      data: { ended_at: new Date('2026-10-07T13:00:00.000Z'), auto_closed: true },
    });
  });

  it('não filtra consultor inativo: jornada vencida de consultor active=false também é fechada', async () => {
    const p = fakePrisma();
    p.field_journeys.findMany.mockResolvedValue([
      {
        id: 'j9',
        started_at: new Date('2026-10-07T12:00:00.000Z'),
        consultant: { active: false },
        points: [{ at: new Date('2026-10-07T15:00:00.000Z') }],
      },
    ]);

    const r = await montar(p).closeStale(new Date('2026-10-08T03:05:00.000Z'));

    const where = (p.field_journeys.findMany.mock.calls[0]![0] as { where: Record<string, unknown> }).where;
    expect(JSON.stringify(where)).not.toContain('active');
    expect(where).not.toHaveProperty('consultant');
    expect(r.journeys).toBe(1);
    expect(p.field_journeys.updateMany).toHaveBeenCalledWith({
      where: { id: 'j9', ended_at: null },
      data: { ended_at: new Date('2026-10-07T15:00:00.000Z'), auto_closed: true },
    });
  });
});

describe('JourneysService.today', () => {
  it('jornada aberta, visitas do dia, visita aberta e contadores', async () => {
    const p = fakePrisma();
    p.field_journeys.findFirst.mockResolvedValue(JORNADA);
    p.field_journeys.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([JORNADA]);
    const visita = {
      id: 'v1', client_id: CLIENT2, journey_id: 'j1', lead_id: 'l1',
      checkin_at: new Date('2026-10-08T13:00:00.000Z'), checkin_lat: -19.92, checkin_lng: -43.93, checkin_accuracy: 10,
      distance_m: null, far_from_place: false, photo_bytes: 1000,
      checkout_at: null, checkout_lat: null, checkout_lng: null, auto_closed: false, clock_adjusted: false,
      interlocutor_name: null, interlocutor_role: null, freela_status: 'cadastrou_qr', interest: null,
      open_vagas: null, vaga_roles: [], freelas_per_week: null, channels: [], channel_other: null,
      needs_followup: null, followup_what: null, followup_date: null, notes: null,
      lead: { name: 'Bar do Mercado', possible_dup: false },
    };
    p.field_visits.findMany.mockResolvedValue([visita]);

    const t = await montar(p).today(C, AGORA);

    expect(t.day).toBe('2026-10-08');
    expect(t.journey?.id).toBe('j1');
    expect(t.journeys).toHaveLength(1);
    expect(t.open_visit?.client_id).toBe(CLIENT2);
    expect(t.open_visit?.missing).toContain('interesse');
    expect(t.counters).toEqual({ visits: 1, cadastrou_qr: 1, closed: 0, cadastrou_agora: 0 });
  });

  it('journey é a jornada ABERTA: sem aberta = null, mesmo com jornadas encerradas hoje', async () => {
    const p = fakePrisma();
    const encerrada = { ...JORNADA, ended_at: new Date('2026-10-08T14:00:00.000Z') };
    p.field_journeys.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([encerrada]);

    const t = await montar(p).today(C, AGORA);

    expect(t.journey).toBeNull();
    expect(t.journeys).toHaveLength(1);
  });
});

describe('JourneysService.today — meta do dia (§25.5)', () => {
  const configs = (over: Partial<Record<'config' | 'alertas', jest.Mock>> = {}) => ({
    config: jest.fn().mockResolvedValue(CONFIG_ROTA_PADRAO),
    alertas: jest.fn().mockResolvedValue(CONFIG_ALERTAS_PADRAO),
    ...over,
  });
  const comConfigs = (p: ReturnType<typeof fakePrisma>, c: ReturnType<typeof configs>) =>
    new JourneysService(p as unknown as PrismaService, undefined, c as never);

  it('traz meta, ritmo e a conta; feitas = visitas do dia; params para o aparelho recalcular', async () => {
    const p = fakePrisma();
    p.field_visits.findMany.mockResolvedValue([]);
    const t = await comConfigs(p, configs()).today(C, AGORA); // 12:00 em Brasília, quinta
    expect(t.goal).toMatchObject({
      meta: 30, feitas: 0, esperadas: 11, delta: -11, faltam: 30, minutos_uteis: 180, dia_de_trabalho: true,
      params: { meta_diaria: 30, janela_inicio: '09:00', janela_fim: '18:00', almoco_inicio: '12:00', almoco_fim: '13:00' },
    });
    expect(t.goal!.conta).toContain('Às 12:00 já deveriam ser 11 (180 min úteis ÷ 16 min); feitas: 0.');
  });

  it('P0 §30.1: "fechado" fica fora da meta e aparece em counters.closed (o total não muda)', async () => {
    const p = fakePrisma();
    const base = {
      id: 'v1', client_id: CLIENT2, journey_id: 'j1', lead_id: 'l1',
      checkin_at: new Date('2026-10-08T13:00:00.000Z'), checkin_lat: -19.92, checkin_lng: -43.93, checkin_accuracy: 10,
      distance_m: null, far_from_place: false, photo_bytes: 1000,
      checkout_lat: null, checkout_lng: null, auto_closed: false, clock_adjusted: false,
      interlocutor_name: null, interlocutor_role: null, freela_status: null, interest: null,
      open_vagas: null, vaga_roles: [], freelas_per_week: null, channels: [], channel_other: null,
      needs_followup: null, followup_what: null, followup_date: null, notes: null,
      lead: { name: 'Bar do Mercado', possible_dup: false },
    };
    const v = (outcome: string) => ({ ...base, checkout_at: new Date('2026-10-08T15:10:00.000Z'), outcome });
    p.field_visits.findMany.mockResolvedValue([v('conversa'), v('fechado'), v('fechado')]);
    const t = await comConfigs(p, configs()).today(C, AGORA);
    expect(t.counters).toMatchObject({ visits: 3, closed: 2 });
    expect(t.goal!.feitas).toBe(1);
  });

  it('Modo do chefe §31.6: visita `simples` "fechado" CONTA na meta (se configurado); `completo` continua fora; counters.cadastrou_agora', async () => {
    const base = {
      client_id: CLIENT2, journey_id: 'j1', lead_id: 'l1',
      checkin_at: new Date('2026-10-08T13:00:00.000Z'), checkin_lat: -19.92, checkin_lng: -43.93, checkin_accuracy: 10,
      distance_m: null, far_from_place: false, photo_bytes: 1000,
      checkout_at: new Date('2026-10-08T15:10:00.000Z'), checkout_lat: null, checkout_lng: null, auto_closed: false, clock_adjusted: false,
      interlocutor_name: null, interlocutor_role: null, freela_status: null, interest: null,
      open_vagas: null, vaga_roles: [], freelas_per_week: null, channels: [], channel_other: null,
      needs_followup: null, followup_what: null, followup_date: null, notes: null,
      lead: { name: 'Bar do Mercado', possible_dup: false },
    };
    const visitas = [
      { ...base, id: 'a', outcome: 'fechado', flow: 'simples', result: 'fechado' },
      { ...base, id: 'b', outcome: 'fechado', flow: 'completo' },
      { ...base, id: 'c', outcome: 'conversa', flow: 'simples', result: 'cadastrou', freela_status: 'declarou' },
    ];
    const rodar = async (conta: boolean, ligado = true) => {
      const p = fakePrisma();
      p.field_visits.findMany.mockResolvedValue(visitas);
      const modo = { ligado, config: jest.fn().mockResolvedValue({ ...CONFIG_MODO_PADRAO, fechado_conta_na_meta: conta }) };
      return new JourneysService(p as unknown as PrismaService, undefined, configs() as never, undefined, modo as never).today(C, AGORA);
    };
    const on = await rodar(true);
    expect(on.goal!.feitas).toBe(2); // o fechado simples + a conversa; o fechado completo fica de fora
    expect(on.counters).toMatchObject({ visits: 3, closed: 2, cadastrou_qr: 0, cadastrou_agora: 1 });
    expect((await rodar(false)).goal!.feitas).toBe(1);
    expect((await rodar(true, false)).goal!.feitas).toBe(1); // flag desligada: padrão de antes
  });

  it('sem o serviço de configuração (testes antigos) ou com falha nele: goal nulo, o Hoje continua', async () => {
    expect((await montar(fakePrisma()).today(C, AGORA)).goal).toBeNull();
    const ruim = configs({ config: jest.fn().mockRejectedValue(new Error('banco caiu')) });
    const t = await comConfigs(fakePrisma(), ruim).today(C, AGORA);
    expect(t.goal).toBeNull();
    expect(t.counters).toEqual({ visits: 0, cadastrou_qr: 0, closed: 0, cadastrou_agora: 0 });
  });
});
