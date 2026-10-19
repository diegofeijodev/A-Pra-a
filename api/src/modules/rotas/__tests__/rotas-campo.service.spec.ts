import { ConflictException, ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CampoConsultant } from '../../../common/auth/campo-consultant';
import type { PrismaService } from '../../../common/database/prisma.service';
import { CONFIG_ROTA_PADRAO } from '../../../domain/rota-rules';
import { RotasCampoService } from '../rotas-campo.service';
import { RotasConfigService } from '../rotas-config.service';
import { AGORA, CLI, CONS_A, CONS_B, DIA, fakePrisma, LEAD, PRACA, rotaRow, ROTA, STOP, stopRow } from './fixtures';

const A: CampoConsultant = { id: CONS_A, name: 'Ana', email: 'a@a.com', praca_id: PRACA, must_change_password: false };
const B: CampoConsultant = { ...A, id: CONS_B, name: 'Bia' };

function montar(p: ReturnType<typeof fakePrisma>, ligado = true, config = CONFIG_ROTA_PADRAO) {
  const configs = { config: jest.fn().mockResolvedValue(config) } as unknown as RotasConfigService;
  return new RotasCampoService(p as unknown as PrismaService, configs, ligado);
}
const codigo = (e: unknown) => ((e as { getResponse: () => { code: string } }).getResponse() as { code: string }).code;
const falha = async (f: () => Promise<unknown>) => f().then(() => null, (e: unknown) => e);
const p2002 = () => new Prisma.PrismaClientKnownRequestError('x', { code: 'P2002', clientVersion: 'x' });

describe('RotasCampoService — flag', () => {
  it('desligada: today responde enabled=false sem consultar o banco; o resto é 404 ROUTES_DISABLED', async () => {
    const p = fakePrisma();
    const s = montar(p, false);
    expect(await s.today(A, AGORA)).toEqual({ enabled: false, route: null, can_generate: false });
    expect(p.field_routes.findFirst).not.toHaveBeenCalled();
    for (const f of [
      () => s.generate(A, { client_id: CLI(1), lat: -23.6, lng: -46.66 }, AGORA),
      () => s.reoptimize(A, { client_id: CLI(2), lat: -23.6, lng: -46.66 }, AGORA),
      () => s.skip(A, STOP(1), { client_id: CLI(3), reason: 'fechado' }, AGORA),
      () => s.defer(A, STOP(1), { client_id: CLI(4) }, AGORA),
      () => s.undo(A, STOP(1), { client_id: CLI(5) }, AGORA),
    ]) {
      const e = await falha(f);
      expect(e).toBeInstanceOf(NotFoundException);
      expect(codigo(e)).toBe('ROUTES_DISABLED');
    }
  });

  it('gerarAoIniciar com a flag desligada não toca no banco', async () => {
    const p = fakePrisma();
    await montar(p, false).gerarAoIniciar(A, { lat: -23.6, lng: -46.66 }, AGORA);
    expect(p.app_settings.findUnique).not.toHaveBeenCalled();
    expect(p.field_routes.findFirst).not.toHaveBeenCalled();
  });
});

describe('RotasCampoService.today', () => {
  it('busca só o roteiro ativo do PRÓPRIO consultor no dia de Brasília e devolve a view', async () => {
    const p = fakePrisma();
    const r = await montar(p).today(A, AGORA);
    expect(p.field_routes.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { consultant_id: CONS_A, day: DIA, status: 'ativa' } }),
    );
    expect(r.enabled).toBe(true);
    expect(r.route).toMatchObject({ id: ROTA, day: DIA, version: 1, source: 'equipe' });
    expect(r.route!.stops.map((s) => s.eta)).toEqual(['10:10', '10:20', '10:30']);
    expect(r.route!.progress).toMatchObject({ meta: 30, done: 0, pending: 3 });
  });

  it('sem roteiro: route nulo; paradas descartadas nunca aparecem para o consultor', async () => {
    const p = fakePrisma();
    p.field_routes.findFirst.mockResolvedValue(null);
    const sem = await montar(p).today(A, AGORA);
    expect(sem).toEqual({ enabled: true, route: null, can_generate: false });
    expect((await montar(p, true, { ...CONFIG_ROTA_PADRAO, consultor_pode_gerar: true }).today(A, AGORA)).can_generate).toBe(true);
    p.field_routes.findFirst.mockResolvedValue(rotaRow({ stops: [stopRow(1), stopRow(2, { status: 'descartada' })] }));
    expect((await montar(p).today(A, AGORA)).route!.stops).toHaveLength(1);
  });
});

describe('RotasCampoService — pular, adiar, desfazer', () => {
  it('skip: grava evento (client_id) e pula; filtra a parada pelo consultor (outro consultor = 404)', async () => {
    const p = fakePrisma();
    const s = montar(p);
    await s.skip(A, STOP(1), { client_id: CLI(1), reason: 'fechado', note: ' sem luz ' }, AGORA);
    expect(p.field_route_stops.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: STOP(1), route: { consultant_id: CONS_A, status: 'ativa' } } }),
    );
    expect(p.field_route_events.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ client_id: CLI(1), kind: 'skip', reason: 'fechado', note: 'sem luz', consultant_id: CONS_A, stop_id: STOP(1) }),
    });
    expect(p.field_route_stops.updateMany).toHaveBeenCalledWith({
      where: { id: STOP(1), status: { in: ['pendente', 'adiada'] } },
      data: expect.objectContaining({ status: 'pulada', skip_reason: 'fechado', skip_note: 'sem luz' }),
    });
    expect(p.field_routes.update).toHaveBeenCalledWith({ where: { id: ROTA }, data: { version: { increment: 1 } } });
  });

  it('isolamento: parada de outro consultor é 404 e nada é gravado', async () => {
    const p = fakePrisma();
    p.field_route_stops.findFirst.mockResolvedValue(null); // o filtro por consultor não acha
    const s = montar(p);
    for (const f of [
      () => s.skip(B, STOP(1), { client_id: CLI(1), reason: 'fechado' }, AGORA),
      () => s.defer(B, STOP(1), { client_id: CLI(2) }, AGORA),
      () => s.undo(B, STOP(1), { client_id: CLI(3) }, AGORA),
    ]) {
      const e = await falha(f);
      expect(e).toBeInstanceOf(NotFoundException);
    }
    expect(p.field_route_stops.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: STOP(1), route: { consultant_id: CONS_B, status: 'ativa' } } }),
    );
    expect(p.field_route_events.create).not.toHaveBeenCalled();
    expect(p.field_route_stops.updateMany).not.toHaveBeenCalled();
  });

  it('id malformado é 404 (não 500)', async () => {
    const e = await falha(() => montar(fakePrisma()).skip(A, 'nao-e-uuid', { client_id: CLI(1), reason: 'fechado' }, AGORA));
    expect(e).toBeInstanceOf(NotFoundException);
  });

  it('idempotência: client_id já aplicado devolve o roteiro sem refazer', async () => {
    const p = fakePrisma();
    p.field_route_events.findUnique.mockResolvedValue({ route_id: ROTA, consultant_id: CONS_A });
    p.field_route_stops.findFirst.mockResolvedValue({ id: STOP(1), route_id: ROTA, status: 'pulada' });
    const v = await montar(p).skip(A, STOP(1), { client_id: CLI(1), reason: 'fechado' }, AGORA);
    expect(v.id).toBe(ROTA);
    expect(p.$transaction).not.toHaveBeenCalled();
  });

  it('client_id de outro consultor → 409 CLIENT_ID_IN_USE', async () => {
    const p = fakePrisma();
    p.field_route_events.findUnique.mockResolvedValue({ route_id: ROTA, consultant_id: CONS_B });
    const e = await falha(() => montar(p).skip(A, STOP(1), { client_id: CLI(1), reason: 'fechado' }, AGORA));
    expect(e).toBeInstanceOf(ConflictException);
    expect(codigo(e)).toBe('CLIENT_ID_IN_USE');
  });

  it('corrida no mesmo client_id (P2002 do evento) devolve o roteiro', async () => {
    const p = fakePrisma();
    p.field_route_events.findUnique.mockResolvedValueOnce(null).mockResolvedValue({ route_id: ROTA, consultant_id: CONS_A });
    p.field_route_events.create.mockRejectedValue(p2002());
    const v = await montar(p).skip(A, STOP(1), { client_id: CLI(1), reason: 'outro' }, AGORA);
    expect(v.id).toBe(ROTA);
  });

  it('parada já visitada: skip/defer → STOP_NOT_PENDING; undo → STOP_NOT_UNDOABLE', async () => {
    const p = fakePrisma();
    p.field_route_stops.findFirst.mockResolvedValue({ id: STOP(1), route_id: ROTA, status: 'visitada' });
    const s = montar(p);
    expect(codigo(await falha(() => s.skip(A, STOP(1), { client_id: CLI(1), reason: 'fechado' }, AGORA)))).toBe('STOP_NOT_PENDING');
    expect(codigo(await falha(() => s.defer(A, STOP(1), { client_id: CLI(2) }, AGORA)))).toBe('STOP_NOT_PENDING');
    expect(codigo(await falha(() => s.undo(A, STOP(1), { client_id: CLI(3) }, AGORA)))).toBe('STOP_NOT_UNDOABLE');
    expect(p.$transaction).not.toHaveBeenCalled();
  });

  it('defer antes do fim do almoço = tarde; depois = amanhã (hora de Brasília, não UTC)', async () => {
    const p = fakePrisma();
    const s = montar(p);
    await s.defer(A, STOP(1), { client_id: CLI(1) }, new Date('2026-10-20T14:00:00Z')); // 11h BRT
    await s.defer(A, STOP(1), { client_id: CLI(2) }, new Date('2026-10-20T17:30:00Z')); // 14h30 BRT
    const calls = p.field_route_stops.updateMany.mock.calls.map((c: any[]) => c[0].data);
    expect(calls[0]).toMatchObject({ status: 'adiada', deferred_to: 'tarde' });
    expect(calls[1]).toMatchObject({ status: 'adiada', deferred_to: 'amanha' });
  });

  it('undo: volta a pendente; se outro consultor já levou o lugar (P2002) → 409 STOP_TAKEN', async () => {
    const p = fakePrisma();
    p.field_route_stops.findFirst.mockResolvedValue({ id: STOP(1), route_id: ROTA, status: 'pulada' });
    await montar(p).undo(A, STOP(1), { client_id: CLI(1) }, AGORA);
    expect(p.field_route_stops.updateMany).toHaveBeenCalledWith({
      where: { id: STOP(1), status: { in: ['pulada', 'adiada'] } },
      data: expect.objectContaining({ status: 'pendente', skip_reason: null }),
    });
    const p2 = fakePrisma();
    p2.field_route_stops.findFirst.mockResolvedValue({ id: STOP(1), route_id: ROTA, status: 'pulada' });
    p2.field_route_stops.updateMany.mockRejectedValue(p2002());
    const e = await falha(() => montar(p2).undo(A, STOP(1), { client_id: CLI(2) }, AGORA));
    expect(codigo(e)).toBe('STOP_TAKEN');
  });

  it('pular/adiar/desfazer não tocam em leads nem em lead_events', async () => {
    const p = fakePrisma();
    p.lead_events = { create: jest.fn() };
    p.leads.update = jest.fn();
    const s = montar(p);
    await s.skip(A, STOP(1), { client_id: CLI(1), reason: 'ja_cliente' }, AGORA);
    expect(p.leads.update).not.toHaveBeenCalled();
    expect(p.lead_events.create).not.toHaveBeenCalled();
  });
});

describe('RotasCampoService.reoptimize', () => {
  it('sem roteiro hoje → 404 ROUTE_NOT_FOUND', async () => {
    const p = fakePrisma();
    p.field_routes.findFirst.mockResolvedValue(null);
    const e = await falha(() => montar(p).reoptimize(A, { client_id: CLI(1), lat: -23.6, lng: -46.66 }, AGORA));
    expect(codigo(e)).toBe('ROUTE_NOT_FOUND');
  });

  it('refaz a partir da posição: mantém a visitada, sobe version com trava otimista e registra o evento', async () => {
    const p = fakePrisma();
    const rota = rotaRow({ stops: [stopRow(1, { status: 'visitada' }), stopRow(2), stopRow(3), stopRow(4, { kind: 'reserva', eta_min: null })] });
    p.field_routes.findFirst.mockResolvedValue(rota);
    p.field_routes.findUniqueOrThrow.mockResolvedValue(rota);
    await montar(p).reoptimize(A, { client_id: CLI(1), lat: -23.597, lng: -46.66 }, AGORA);
    expect(p.field_route_events.create).toHaveBeenCalledWith({ data: expect.objectContaining({ kind: 'reoptimize', client_id: CLI(1) }) });
    expect(p.field_routes.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: ROTA, version: 1 } }));
    const atualizadas = p.field_route_stops.update.mock.calls.map((c: any[]) => c[0].where.id);
    expect(atualizadas).not.toContain(STOP(1)); // visitada intacta
    expect(atualizadas).toEqual(expect.arrayContaining([STOP(2), STOP(3), STOP(4)]));
    // a reserva entrou como planejada (a meta é 30 e só há 3 pendentes)
    const reserva = p.field_route_stops.update.mock.calls.find((c: any[]) => c[0].where.id === STOP(4))[0].data;
    expect(reserva).toMatchObject({ kind: 'planejada', status: 'pendente' });
    expect(reserva.eta_min).toBeGreaterThanOrEqual(11 * 60);
  });

  it('versão mudou no meio (updateMany count 0): relê e tenta uma vez; na segunda desiste com 409', async () => {
    const p = fakePrisma();
    p.field_routes.updateMany.mockResolvedValue({ count: 0 });
    const e = await falha(() => montar(p).reoptimize(A, { client_id: CLI(1), lat: -23.6, lng: -46.66 }, AGORA));
    expect(codigo(e)).toBe('ROUTE_VERSION_CONFLICT');
    expect(p.field_routes.updateMany).toHaveBeenCalledTimes(2);
  });
});

describe('RotasCampoService.generate / gerarAoIniciar', () => {
  it('já existe roteiro hoje: devolve o ativo (idempotente) sem checar permissão', async () => {
    const p = fakePrisma();
    const v = await montar(p).generate(A, { client_id: CLI(1), lat: -23.6, lng: -46.66 }, AGORA);
    expect(v.id).toBe(ROTA);
    expect(p.field_routes.create).not.toHaveBeenCalled();
  });

  it('sem roteiro e sem consultor_pode_gerar → 403 ROUTE_GENERATE_NOT_ALLOWED', async () => {
    const p = fakePrisma();
    p.field_routes.findFirst.mockResolvedValue(null);
    const e = await falha(() => montar(p).generate(A, { client_id: CLI(1), lat: -23.6, lng: -46.66 }, AGORA));
    expect(e).toBeInstanceOf(ForbiddenException);
    expect(codigo(e)).toBe('ROUTE_GENERATE_NOT_ALLOWED');
  });

  it('permitido mas sem leads elegíveis (nem áreas) → 422 ROUTE_NO_CANDIDATES', async () => {
    const p = fakePrisma();
    p.field_routes.findFirst.mockResolvedValue(null);
    const e = await falha(() =>
      montar(p, true, { ...CONFIG_ROTA_PADRAO, consultor_pode_gerar: true }).generate(A, { client_id: CLI(1), lat: -23.6, lng: -46.66 }, AGORA),
    );
    expect(e).toBeInstanceOf(UnprocessableEntityException);
    expect(codigo(e)).toBe('ROUTE_NO_CANDIDATES');
  });

  it('monta o roteiro automático só com leads DA PRAÇA do consultor, na área, sem bloqueados/visitados/ocupados', async () => {
    const p = fakePrisma();
    p.field_routes.findFirst.mockResolvedValueOnce(null).mockResolvedValue(rotaRow());
    p.field_areas.findMany.mockResolvedValue([{ id: 'a', praca_id: PRACA, lat: -23.6, lng: -46.66, radius_m: 2000 }]);
    const lead = (n: number, over: Record<string, unknown> = {}) => ({
      id: LEAD(n), name: `Bar ${n}`, address: '', phone: '', phone_key: n === 2 ? '11999' : '', lat: -23.6 + n * 0.001, lng: -46.66, ...over,
    });
    p.leads.findMany.mockResolvedValue([lead(1), lead(2), lead(3), lead(4), lead(5, { lat: -22.0 })]);
    p.blocklist.findMany.mockResolvedValue([{ phone_key: '11999' }]); // lead 2 bloqueado
    p.field_visits.findMany.mockResolvedValue([{ lead_id: LEAD(3) }]); // lead 3 visitado há pouco
    p.field_route_stops.findMany.mockResolvedValue([{ lead_id: LEAD(4) }]); // lead 4 com outro consultor
    const config = { ...CONFIG_ROTA_PADRAO, consultor_pode_gerar: true };
    await montar(p, true, config).generate(A, { client_id: CLI(1), lat: -23.6, lng: -46.66 }, AGORA);
    expect(p.leads.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ praca_id: PRACA, archived: false, location_precision: { in: ['point', 'address'] } }),
      }),
    );
    expect(p.field_areas.findMany).toHaveBeenCalledWith({ where: { praca_id: PRACA, active: true } });
    const criadas = p.field_route_stops.createMany.mock.calls[0][0].data.map((d: any) => d.lead_id);
    expect(criadas).toEqual([LEAD(1)]); // 2 bloqueado, 3 visitado, 4 ocupado, 5 fora da área
    expect(p.field_routes.create).toHaveBeenCalledWith({ data: expect.objectContaining({ consultant_id: CONS_A, praca_id: PRACA, source: 'consultor', day: DIA }) });
  });

  it('gerarAoIniciar NUNCA lança, mesmo com falha do banco', async () => {
    const p = fakePrisma();
    p.app_settings.findUnique.mockRejectedValue(new Error('banco caiu'));
    const configs = { config: jest.fn().mockRejectedValue(new Error('banco caiu')) } as unknown as RotasConfigService;
    const s = new RotasCampoService(p as unknown as PrismaService, configs, true);
    await expect(s.gerarAoIniciar(A, { lat: -23.6, lng: -46.66 }, AGORA)).resolves.toBeUndefined();
  });

  it('gerarAoIniciar só gera com gerar_ao_iniciar ligado', async () => {
    const p = fakePrisma();
    p.field_routes.findFirst.mockResolvedValue(null);
    await montar(p).gerarAoIniciar(A, { lat: -23.6, lng: -46.66 }, AGORA);
    expect(p.field_areas.findMany).not.toHaveBeenCalled();
    await montar(p, true, { ...CONFIG_ROTA_PADRAO, gerar_ao_iniciar: true }).gerarAoIniciar(A, { lat: -23.6, lng: -46.66 }, AGORA);
    expect(p.field_areas.findMany).toHaveBeenCalled();
  });
});
