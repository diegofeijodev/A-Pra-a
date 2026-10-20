import 'reflect-metadata';
import type { PrismaService } from '../../../common/database/prisma.service';
import { ADMIN_ONLY_KEY } from '../../../common/decorators/admin-only.decorator';
import { CAMPO_ROUTE_KEY } from '../../../common/decorators/campo-route.decorator';
import { CONFIG_ALERTAS_PADRAO } from '../../../domain/alerta-rules';
import { CONFIG_ROTA_PADRAO } from '../../../domain/rota-rules';
import type { RotasConfigService } from '../../rotas/rotas-config.service';
import { AtencaoService } from '../atencao.service';
import { CampoController } from '../campo.controller';
import { ConsultoresController } from '../consultores.controller';

const PRACA = '00000000-0000-4000-8000-0000000000a1';
const C1 = '00000000-0000-4000-8000-0000000000c1';
const C2 = '00000000-0000-4000-8000-0000000000c2';
const C3 = '00000000-0000-4000-8000-0000000000c3';
/** Terça 20/10/2026, 11:00 em Brasília. */
const AGORA = new Date('2026-10-20T14:00:00.000Z');
const brt = (hhmm: string) => new Date(`2026-10-20T${hhmm}:00-03:00`);

const consultor = (id: string, name: string, over: Record<string, unknown> = {}) => ({
  id, name, phone: '(11) 98888-0000', praca_id: PRACA, active: true, praca: { name: 'São Paulo' }, ...over,
});

function fake() {
  return {
    pracas: { findUnique: jest.fn().mockResolvedValue({ id: PRACA }) },
    field_consultants: { findMany: jest.fn().mockResolvedValue([consultor(C1, 'Ana'), consultor(C2, 'Bruno'), consultor(C3, 'Carla')]) },
    field_journeys: { findMany: jest.fn().mockResolvedValue([]) },
    field_visits: { findMany: jest.fn().mockResolvedValue([]) },
    field_points: { groupBy: jest.fn().mockResolvedValue([]) },
    field_route_stops: { findMany: jest.fn().mockResolvedValue([]) },
  };
}
function svc(p: ReturnType<typeof fake>, ligado = false, alertas = CONFIG_ALERTAS_PADRAO) {
  const configs = { config: jest.fn().mockResolvedValue(CONFIG_ROTA_PADRAO), alertas: jest.fn().mockResolvedValue(alertas) } as unknown as RotasConfigService;
  return new AtencaoService(p as unknown as PrismaService, configs, ligado);
}
const falha = async (f: () => Promise<unknown>) => f().then(() => null, (e: unknown) => e);

describe('AtencaoService — meta e "Atenção agora" da equipe', () => {
  it('junta jornadas, visitas e pontos: Ana ok, Bruno não iniciou, Carla com visita aberta há 52 min', async () => {
    const p = fake();
    p.field_journeys.findMany.mockResolvedValue([
      { id: 'j1', consultant_id: C1, started_at: brt('09:00'), ended_at: null },
      { id: 'j3', consultant_id: C3, started_at: brt('09:00'), ended_at: null },
    ]);
    p.field_points.groupBy.mockResolvedValue([
      { journey_id: 'j1', _max: { at: brt('10:55') } },
      { journey_id: 'j3', _max: { at: brt('10:08') } },
    ]);
    p.field_visits.findMany.mockResolvedValue([
      { consultant_id: C1, checkin_at: brt('10:00'), checkout_at: brt('10:20'), auto_closed: false, lead: { name: 'Bar A' } },
      { consultant_id: C3, checkin_at: brt('10:08'), checkout_at: null, auto_closed: false, lead: { name: 'Churrascaria Sul' } },
    ]);
    const r = await svc(p).painel(undefined, AGORA);

    expect(r).toMatchObject({ day: '2026-10-20', now: '11:00', dia_de_trabalho: true });
    expect(r.consultants.map((c) => [c.name, c.status, c.goal.feitas])).toEqual([
      ['Ana', 'em_jornada', 1],
      ['Bruno', 'nao_iniciou', 0],
      ['Carla', 'em_jornada', 1],
    ]);
    // às 11:00 esperam 7 (120 min úteis ÷ 16); Ana 1 feita = 6 atrás (>= 5) → ritmo
    expect(r.consultants[0]!.goal).toMatchObject({ meta: 30, esperadas: 7, delta: -6, minutos_uteis: 120 });
    expect(r.alerts.map((a) => `${a.consultant_name}:${a.code}`)).toEqual([
      'Bruno:nao_iniciou',
      'Ana:ritmo_atrasado',
      'Carla:visita_aberta',
      'Carla:ritmo_atrasado',
    ]);
    const visita = r.alerts.find((a) => a.code === 'visita_aberta')!;
    expect(visita.message).toBe('Carla — visita aberta há 52 min (Churrascaria Sul).');
    expect(visita.phone).toBe('(11) 98888-0000');
    expect(r.thresholds).toMatchObject({ alerta_visita_aberta_min: 40, alerta_ritmo_atras: 5 });
  });

  it('isolamento: com praca_id filtra só consultores ATIVOS daquela praça; praça inexistente → 404 sem consultar', async () => {
    const p = fake();
    await svc(p).painel(PRACA, AGORA);
    expect(p.field_consultants.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { active: true, praca_id: PRACA } }));
    const sem = fake();
    sem.pracas.findUnique.mockResolvedValue(null);
    const e = await falha(() => svc(sem).painel(PRACA, AGORA));
    expect((e as { getStatus: () => number }).getStatus()).toBe(404);
    expect(sem.field_consultants.findMany).not.toHaveBeenCalled();
  });

  it('as consultas de jornada e visita usam só os consultores da praça pedida e o dia de Brasília', async () => {
    const p = fake();
    p.field_consultants.findMany.mockResolvedValue([consultor(C1, 'Ana')]);
    await svc(p).painel(PRACA, AGORA);
    expect(p.field_journeys.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { day: '2026-10-20', consultant_id: { in: [C1] } } }));
    expect(p.field_visits.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { consultant_id: { in: [C1] }, journey: { day: '2026-10-20' } } }));
  });

  it('sem consultores: resposta vazia sem tocar nas outras tabelas', async () => {
    const p = fake();
    p.field_consultants.findMany.mockResolvedValue([]);
    const r = await svc(p).painel(undefined, AGORA);
    expect(r.consultants).toEqual([]);
    expect(r.alerts).toEqual([]);
    expect(p.field_journeys.findMany).not.toHaveBeenCalled();
  });

  it('domingo: ninguém é cobrado ("dia_de_trabalho" falso, sem alertas)', async () => {
    const p = fake();
    const domingo = new Date('2026-10-18T14:00:00.000Z');
    const r = await svc(p).painel(undefined, domingo);
    expect(r.dia_de_trabalho).toBe(false);
    expect(r.alerts).toEqual([]);
    expect(r.consultants.every((c) => !c.goal.dia_de_trabalho)).toBe(true);
  });

  it('virada de fuso: 22h de segunda em Brasília ainda é segunda (o UTC já é terça)', async () => {
    const p = fake();
    const r = await svc(p, false, { ...CONFIG_ALERTAS_PADRAO, dias_trabalho: [1] }).painel(undefined, new Date('2026-10-20T01:30:00.000Z'));
    expect(r.day).toBe('2026-10-19');
    expect(r.dia_de_trabalho).toBe(true);
  });

  it('parada vencida só com roteiro ligado: lê as paradas pendentes do roteiro ativo de hoje', async () => {
    const desligado = fake();
    await svc(desligado, false).painel(undefined, AGORA);
    expect(desligado.field_route_stops.findMany).not.toHaveBeenCalled();

    const p = fake();
    p.field_consultants.findMany.mockResolvedValue([consultor(C1, 'Ana')]);
    p.field_journeys.findMany.mockResolvedValue([{ id: 'j1', consultant_id: C1, started_at: brt('09:00'), ended_at: null }]);
    p.field_points.groupBy.mockResolvedValue([{ journey_id: 'j1', _max: { at: brt('10:58') } }]);
    p.field_visits.findMany.mockResolvedValue(Array.from({ length: 8 }, (_, i) => ({ consultant_id: C1, checkin_at: brt('10:00'), checkout_at: brt('10:10'), auto_closed: false, lead: { name: `L${i}` } })));
    p.field_route_stops.findMany.mockResolvedValue([{ name_snap: 'Padaria Velha', eta_min: 9 * 60 + 40, route: { consultant_id: C1 } }]);
    const r = await svc(p, true).painel(undefined, AGORA);
    expect(p.field_route_stops.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'pendente', kind: 'planejada', route: { day: '2026-10-20', status: 'ativa', consultant_id: { in: [C1] } } }) }),
    );
    expect(r.alerts.map((a) => a.code)).toEqual(['parada_vencida']);
    expect(r.alerts[0]!.message).toContain('Padaria Velha, previsto 09:40');
  });

  it('quem encerrou a jornada não gera alerta mas aparece com a meta', async () => {
    const p = fake();
    p.field_consultants.findMany.mockResolvedValue([consultor(C1, 'Ana')]);
    p.field_journeys.findMany.mockResolvedValue([{ id: 'j1', consultant_id: C1, started_at: brt('09:00'), ended_at: brt('10:30') }]);
    const r = await svc(p).painel(undefined, AGORA);
    expect(r.alerts).toEqual([]);
    expect(r.consultants[0]).toMatchObject({ status: 'encerrou', alerts: [] });
  });
});

describe('rotas só da equipe (token de consultor → 401)', () => {
  it('attention e followups da equipe: sem @CampoRoute e sem @AdminOnly (leitura de qualquer da equipe)', () => {
    for (const nome of ['attention', 'followupsDaEquipe'] as const) {
      const h = ConsultoresController.prototype[nome];
      expect(Reflect.getMetadata(CAMPO_ROUTE_KEY, h)).toBeUndefined();
      expect(Reflect.getMetadata(ADMIN_ONLY_KEY, h)).toBeUndefined();
    }
    expect(Reflect.getMetadata(CAMPO_ROUTE_KEY, ConsultoresController)).toBeUndefined();
  });

  it('followups do consultor vive no CampoController, que é todo @CampoRoute', () => {
    expect(Reflect.getMetadata(CAMPO_ROUTE_KEY, CampoController)).toBe(true);
    expect(typeof CampoController.prototype.followupsDoConsultor).toBe('function');
  });
});
