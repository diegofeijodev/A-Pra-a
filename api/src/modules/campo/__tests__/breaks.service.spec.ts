/**
 * Lote B da Lovable, L4 (contrato §37): intervalo como evento da jornada — rotas, idempotência, encerramentos automáticos e
 * o efeito no Hoje/"Atenção agora", com a flag desligada (nada muda) e ligada.
 */
import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CampoConsultant } from '../../../common/auth/campo-consultant';
import type { PrismaService } from '../../../common/database/prisma.service';
import type { RotasConfigService } from '../../rotas/rotas-config.service';
import { BreaksService } from '../breaks.service';
import { encerrarIntervaloAberto } from '../breaks-views';
import { JourneysService } from '../journeys.service';

const CONS = '44444444-4444-4444-8444-444444444444';
const OUTRO = '66666666-6666-4666-8666-666666666666';
const PRACA = '00000000-0000-4000-8000-0000000000aa';
const CID = '11111111-1111-4111-8111-111111111111';
const CID_FIM = '22222222-2222-4222-8222-222222222222';
const C: CampoConsultant = {
  id: CONS,
  name: 'Ana',
  email: 'a@a.com',
  praca_id: PRACA,
  must_change_password: false,
};
const AGORA = new Date('2026-10-22T16:00:00.000Z'); // 13:00 em Brasília
const JORNADA = {
  id: 'j1',
  consultant_id: CONS,
  day: '2026-10-22',
  started_at: new Date('2026-10-22T12:00:00.000Z'),
  ended_at: null,
};
const PAUSA = {
  id: 'b1',
  client_id: CID,
  journey_id: 'j1',
  consultant_id: CONS,
  started_at: new Date('2026-10-22T15:04:00.000Z'),
  ended_at: null as Date | null,
  end_reason: null as string | null,
  auto_closed: false,
  clock_adjusted: false,
};

function fakePrisma() {
  return {
    field_journey_breaks: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      findUniqueOrThrow: jest.fn().mockResolvedValue(PAUSA),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue(PAUSA),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      count: jest.fn().mockResolvedValue(0),
    },
    field_visits: { findFirst: jest.fn().mockResolvedValue(null) },
  };
}
const servico = (p: ReturnType<typeof fakePrisma>, breaks = true, aberta: unknown = JORNADA) =>
  new BreaksService(
    p as unknown as PrismaService,
    {
      abertaOuFalha: jest
        .fn()
        .mockImplementation(async () =>
          aberta ? aberta : Promise.reject(new ConflictException({ code: 'NO_OPEN_JOURNEY' })),
        ),
    } as unknown as JourneysService,
    { checklist: false, breaks },
  );
const corpo = (over: Record<string, unknown> = {}) => ({
  client_id: CID,
  at: '2026-10-22T15:04:00.000Z',
  ...over,
});

describe('flag desligada', () => {
  it('início e fim = 404 BREAKS_DISABLED, nada consultado', async () => {
    const p = fakePrisma();
    const s = servico(p, false);
    await expect(s.start(C, corpo(), AGORA)).rejects.toMatchObject({
      status: 404,
      response: { code: 'BREAKS_DISABLED' },
    });
    await expect(s.end(C, corpo(), AGORA)).rejects.toMatchObject({
      status: 404,
      response: { code: 'BREAKS_DISABLED' },
    });
    expect(p.field_journey_breaks.findUnique).not.toHaveBeenCalled();
  });
});

describe('início do intervalo', () => {
  it('grava com a hora saneada e a posição opcional; devolve o BreakView com os minutos até agora', async () => {
    const p = fakePrisma();
    const v = await servico(p).start(C, corpo({ lat: -19.9, lng: -43.9, accuracy: 12 }), AGORA);
    expect(p.field_journey_breaks.create.mock.calls[0][0].data).toMatchObject({
      journey_id: 'j1',
      consultant_id: CONS,
      client_id: CID,
      started_at: new Date('2026-10-22T15:04:00.000Z'),
      start_lat: -19.9,
    });
    expect(v).toMatchObject({ id: 'b1', ended_at: null, minutes: 56, end_reason: null });
  });
  it('reenvio do mesmo client_id = o mesmo intervalo; de outro consultor = 409 CLIENT_ID_IN_USE', async () => {
    const p = fakePrisma();
    p.field_journey_breaks.findUnique.mockResolvedValue(PAUSA);
    await expect(servico(p).start(C, corpo(), AGORA)).resolves.toMatchObject({ id: 'b1' });
    expect(p.field_journey_breaks.create).not.toHaveBeenCalled();
    p.field_journey_breaks.findUnique.mockResolvedValue({ ...PAUSA, consultant_id: OUTRO });
    await expect(servico(p).start(C, corpo(), AGORA)).rejects.toMatchObject({
      status: 409,
      response: { code: 'CLIENT_ID_IN_USE' },
    });
  });
  it('sem jornada = 409 NO_OPEN_JOURNEY; visita aberta = 409 VISIT_OPEN; já aberto = 409 BREAK_ALREADY_OPEN', async () => {
    await expect(servico(fakePrisma(), true, null).start(C, corpo(), AGORA)).rejects.toMatchObject({
      response: { code: 'NO_OPEN_JOURNEY' },
    });
    const comVisita = fakePrisma();
    comVisita.field_visits.findFirst.mockResolvedValue({ id: 'v1' });
    await expect(servico(comVisita).start(C, corpo(), AGORA)).rejects.toMatchObject({
      status: 409,
      response: { code: 'VISIT_OPEN' },
    });
    const aberto = fakePrisma();
    aberto.field_journey_breaks.findFirst.mockResolvedValue({ id: 'b0' });
    await expect(servico(aberto).start(C, corpo(), AGORA)).rejects.toMatchObject({
      status: 409,
      response: { code: 'BREAK_ALREADY_OPEN' },
    });
    expect(aberto.field_journey_breaks.create).not.toHaveBeenCalled();
  });
  it('corrida no índice parcial (outro intervalo abriu antes) = 409 BREAK_ALREADY_OPEN', async () => {
    const p = fakePrisma();
    p.field_journey_breaks.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'x' }),
    );
    await expect(servico(p).start(C, corpo(), AGORA)).rejects.toMatchObject({
      response: { code: 'BREAK_ALREADY_OPEN' },
    });
  });
});

describe('fim do intervalo', () => {
  it('encerra o aberto (manual) com o client_id do fim e a hora saneada', async () => {
    const p = fakePrisma();
    p.field_journey_breaks.findFirst.mockResolvedValue(PAUSA);
    await servico(p).end(C, corpo({ client_id: CID_FIM, at: '2026-10-22T16:00:00.000Z' }), AGORA);
    expect(p.field_journey_breaks.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: 'b1', ended_at: null },
      data: { ended_at: new Date('2026-10-22T16:00:00.000Z'), end_client_id: CID_FIM, end_reason: 'manual' },
    });
  });
  it('reenvio do mesmo fim = o mesmo intervalo, nada gravado de novo', async () => {
    const p = fakePrisma();
    p.field_journey_breaks.findUnique.mockResolvedValue({ ...PAUSA, ended_at: AGORA, end_reason: 'manual' });
    await expect(servico(p).end(C, corpo({ client_id: CID_FIM }), AGORA)).resolves.toMatchObject({
      end_reason: 'manual',
    });
    expect(p.field_journey_breaks.updateMany).not.toHaveBeenCalled();
  });
  it('sem intervalo aberto: o último encerrado sozinho (check-in) há < 24 h = 200; senão 409 NO_OPEN_BREAK', async () => {
    const p = fakePrisma();
    p.field_journey_breaks.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        ...PAUSA,
        ended_at: new Date('2026-10-22T15:30:00.000Z'),
        end_reason: 'checkin',
      });
    await expect(servico(p).end(C, corpo({ client_id: CID_FIM }), AGORA)).resolves.toMatchObject({
      end_reason: 'checkin',
      minutes: 26,
    });
    const q = fakePrisma();
    q.field_journey_breaks.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        ...PAUSA,
        ended_at: new Date('2026-10-22T15:30:00.000Z'),
        end_reason: 'manual',
      });
    await expect(servico(q).end(C, corpo({ client_id: CID_FIM }), AGORA)).rejects.toMatchObject({
      status: 409,
      response: { code: 'NO_OPEN_BREAK' },
    });
  });
});

describe('encerramento automático', () => {
  it('o fim nunca fica antes do início; meia-noite marca auto_closed', async () => {
    const p = fakePrisma();
    p.field_journey_breaks.findFirst.mockResolvedValue({
      id: 'b1',
      started_at: new Date('2026-10-22T15:04:00.000Z'),
    });
    await encerrarIntervaloAberto(p as never, 'j1', new Date('2026-10-22T15:00:00.000Z'), 'auto');
    expect(p.field_journey_breaks.updateMany.mock.calls[0][0].data).toEqual({
      ended_at: new Date('2026-10-22T15:04:00.000Z'),
      end_reason: 'auto',
      auto_closed: true,
    });
  });
});

describe('JourneysService com o intervalo', () => {
  const prismaHoje = (pausas: unknown[]) => ({
    field_journeys: {
      findMany: jest
        .fn()
        .mockResolvedValue([
          {
            ...JORNADA,
            client_id: 'c',
            start_lat: 0,
            start_lng: 0,
            end_lat: null,
            end_lng: null,
            auto_closed: false,
          },
        ]),
      findFirst: jest
        .fn()
        .mockResolvedValue({
          ...JORNADA,
          client_id: 'c',
          start_lat: 0,
          start_lng: 0,
          end_lat: null,
          end_lng: null,
          auto_closed: false,
        }),
    },
    field_visits: { findMany: jest.fn().mockResolvedValue([]) },
    field_journey_breaks: { findMany: jest.fn().mockResolvedValue(pausas) },
  });
  const configs = {
    config: jest
      .fn()
      .mockResolvedValue({
        meta_diaria: 30,
        janela_inicio: '09:00',
        janela_fim: '18:00',
        almoco_inicio: '12:00',
        almoco_fim: '13:00',
        minutos_por_visita: 8,
        velocidade_kmh: 4.5,
        fator_desvio: 1.3,
        pool_fator: 1.5,
        dias_sem_revisitar: 14,
        estagio_maximo_rota: 4,
        gerar_ao_iniciar: false,
        consultor_pode_gerar: false,
      }),
    alertas: jest.fn().mockResolvedValue({ dias_trabalho: [0, 1, 2, 3, 4, 5, 6] }),
  } as unknown as RotasConfigService;
  const jornadas = (p: unknown, breaks: boolean) => {
    const j = new JourneysService(p as PrismaService, undefined, configs, undefined, undefined, {
      checklist: false,
      breaks,
    });
    jest.spyOn(j, 'closeStale').mockResolvedValue({ journeys: 0, visits: 0 });
    return j;
  };

  it('flag desligada: Hoje sem as chaves breaks/breaks_open e sem consulta nova', async () => {
    const p = prismaHoje([PAUSA]);
    const t = await jornadas(p, false).today(C, AGORA);
    expect(t).not.toHaveProperty('breaks');
    expect(t).not.toHaveProperty('breaks_open');
    expect(p.field_journey_breaks.findMany).not.toHaveBeenCalled();
  });
  it('flag ligada: os intervalos do dia, o aberto e a meta descontando o intervalo real', async () => {
    const t = await jornadas(prismaHoje([PAUSA]), true).today(C, AGORA);
    expect(t.breaks).toHaveLength(1);
    expect(t.breaks_open).toMatchObject({ id: 'b1', minutes: 56 });
    expect(t.goal?.conta).toContain('descontado o intervalo registrado de 56 min');
  });
});

describe('check-in e fim da jornada encerram o intervalo (flag ligada)', () => {
  it('fim da jornada: encerra no instante do fim (journey_end), na mesma transação', async () => {
    const tx = {
      field_journeys: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      field_points: { create: jest.fn().mockResolvedValue({}) },
      field_journey_breaks: {
        findFirst: jest.fn().mockResolvedValue({ id: 'b1', started_at: PAUSA.started_at }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const p = {
      field_journeys: {
        findFirst: jest.fn().mockResolvedValue(JORNADA),
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({
            ...JORNADA,
            client_id: 'c',
            start_lat: 0,
            start_lng: 0,
            end_lat: 0,
            end_lng: 0,
            auto_closed: false,
            ended_at: AGORA,
          }),
      },
      field_visits: { count: jest.fn().mockResolvedValue(0) },
      $transaction: jest.fn().mockImplementation(async (fn: (t: unknown) => Promise<unknown>) => fn(tx)),
    };
    const j = new JourneysService(p as unknown as PrismaService, undefined, undefined, undefined, undefined, {
      checklist: false,
      breaks: true,
    });
    await j.end(C, { at: AGORA.toISOString(), lat: 0, lng: 0, accuracy: 5 }, AGORA);
    expect(tx.field_journey_breaks.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: 'b1', ended_at: null },
      data: { ended_at: AGORA, end_reason: 'journey_end' },
    });
    const sem = new JourneysService(
      p as unknown as PrismaService,
      undefined,
      undefined,
      undefined,
      undefined,
      { checklist: false, breaks: false },
    );
    tx.field_journey_breaks.findFirst.mockClear();
    await sem.end(C, { at: AGORA.toISOString(), lat: 0, lng: 0, accuracy: 5 }, AGORA);
    expect(tx.field_journey_breaks.findFirst).not.toHaveBeenCalled();
  });
});
