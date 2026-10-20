import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ConflictException, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '../../../common/auth/auth-user';
import type { PrismaService } from '../../../common/database/prisma.service';
import { ADMIN_ONLY_KEY } from '../../../common/decorators/admin-only.decorator';
import { CAMPO_ROUTE_KEY } from '../../../common/decorators/campo-route.decorator';
import { CONFIG_ROTA_PADRAO } from '../../../domain/rota-rules';
import { MontarRotaDto } from '../dto/rotas.dto';
import { RotasCampoController } from '../rotas-campo.controller';
import type { RotasConfigService } from '../rotas-config.service';
import { RotasConfigController, RotasEquipeController } from '../rotas-equipe.controller';
import { RotasEquipeService } from '../rotas-equipe.service';
import { AGORA, CONS_A, CONS_B, DIA, fakePrisma, LEAD, PRACA, PRACA_B, ROTA, rotaRow, STOP, stopRow } from './fixtures';

const ADMIN: AuthUser = { id: '00000000-0000-4000-8000-0000000000dd', email: 'a@a.com', name: 'A', is_admin: true };
const AREA = '00000000-0000-4000-8000-0000000000cc';

function montar(p: ReturnType<typeof fakePrisma>, ligado = true) {
  const configs = { config: jest.fn().mockResolvedValue(CONFIG_ROTA_PADRAO) } as unknown as RotasConfigService;
  return new RotasEquipeService(p as unknown as PrismaService, configs, ligado);
}
const falha = async (f: () => Promise<unknown>) => f().then(() => null, (e: unknown) => e);
const codigo = (e: unknown) => ((e as { getResponse: () => { code: string } }).getResponse() as { code: string }).code;
const lead = (n: number, over: Record<string, unknown> = {}) => ({
  id: LEAD(n), name: `Bar ${n}`, address: `Rua ${n}`, phone: '', lat: -23.6 + n * 0.001, lng: -46.66, praca_id: PRACA, archived: false, ...over,
});

describe('RotasEquipeService.build — isolamento entre praças e regras de montagem', () => {
  it('lead de OUTRA praça → 400, sem revelar se existe (mesma resposta de lead inexistente)', async () => {
    const p = fakePrisma();
    p.leads.findMany.mockResolvedValue([lead(1), lead(2, { praca_id: PRACA_B })]);
    const e = await falha(() => montar(p).build({ consultant_id: CONS_A, day: DIA, lead_ids: [LEAD(1), LEAD(2)] }, ADMIN, AGORA));
    expect(codigo(e)).toBe('VALIDATION_ERROR');
    expect(p.$transaction).not.toHaveBeenCalled();
    p.leads.findMany.mockResolvedValue([lead(1)]);
    const e2 = await falha(() => montar(p).build({ consultant_id: CONS_A, day: DIA, lead_ids: [LEAD(1), LEAD(9)] }, ADMIN, AGORA));
    expect((e as Error).message).toBe((e2 as Error).message);
  });

  it('área de outra praça → 404; consultor inexistente → 404; consultor desativado → 400; dia passado → 400', async () => {
    const p = fakePrisma();
    p.leads.findMany.mockResolvedValue([lead(1)]);
    const s = montar(p);
    expect(await falha(() => s.build({ consultant_id: CONS_A, day: DIA, lead_ids: [LEAD(1)], area_id: AREA }, ADMIN, AGORA))).toBeInstanceOf(NotFoundException);
    expect(p.field_areas.findFirst).toHaveBeenCalledWith({ where: { id: AREA, praca_id: PRACA } });
    p.field_consultants.findUnique.mockResolvedValue(null);
    expect(await falha(() => s.build({ consultant_id: CONS_B, day: DIA, lead_ids: [LEAD(1)] }, ADMIN, AGORA))).toBeInstanceOf(NotFoundException);
    p.field_consultants.findUnique.mockResolvedValue({ id: CONS_A, praca_id: PRACA, active: false });
    expect(codigo(await falha(() => s.build({ consultant_id: CONS_A, day: DIA, lead_ids: [LEAD(1)] }, ADMIN, AGORA)))).toBe('VALIDATION_ERROR');
    p.field_consultants.findUnique.mockResolvedValue({ id: CONS_A, praca_id: PRACA, active: true });
    expect(codigo(await falha(() => s.build({ consultant_id: CONS_A, day: '2026-10-19', lead_ids: [LEAD(1)] }, ADMIN, AGORA)))).toBe('VALIDATION_ERROR');
  });

  it('lead sem localização ou arquivado → 400', async () => {
    const p = fakePrisma();
    p.leads.findMany.mockResolvedValue([lead(1, { lat: null })]);
    expect(codigo(await falha(() => montar(p).build({ consultant_id: CONS_A, day: DIA, lead_ids: [LEAD(1)] }, ADMIN, AGORA)))).toBe('VALIDATION_ERROR');
  });

  it('lead já no roteiro de outro consultor no dia → 409 LEAD_IN_OTHER_ROUTE (a conferência exclui o próprio consultor)', async () => {
    const p = fakePrisma();
    p.leads.findMany.mockResolvedValue([lead(1)]);
    p.field_route_stops.findMany.mockResolvedValue([{ name_snap: 'Bar 1' }]);
    const e = await falha(() => montar(p).build({ consultant_id: CONS_A, day: DIA, lead_ids: [LEAD(1)] }, ADMIN, AGORA));
    expect(e).toBeInstanceOf(ConflictException);
    expect(codigo(e)).toBe('LEAD_IN_OTHER_ROUTE');
    expect(p.field_route_stops.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ day: DIA, route: { consultant_id: { not: CONS_A } } }) }),
    );
  });

  it('cria o roteiro: leads repetidos contam uma vez, nada de lead/cadência, paradas fotografadas', async () => {
    const p = fakePrisma();
    p.field_routes.findFirst.mockResolvedValue(null);
    p.field_route_stops.findMany.mockResolvedValue([]);
    p.leads.findMany.mockResolvedValue([lead(1), lead(2)]);
    p.leads.create = jest.fn();
    p.leads.update = jest.fn();
    p.place_candidates.findMany.mockResolvedValue([{ id: 'cand1', lead_id: LEAD(2) }]);
    const v = await montar(p).build({ consultant_id: CONS_A, day: DIA, lead_ids: [LEAD(1), LEAD(2), LEAD(1)] }, ADMIN, AGORA);
    expect(v.id).toBe(ROTA);
    const rota = p.field_routes.create.mock.calls[0][0].data;
    expect(rota).toMatchObject({ consultant_id: CONS_A, praca_id: PRACA, day: DIA, source: 'equipe', created_by: ADMIN.id });
    const paradas = p.field_route_stops.createMany.mock.calls[0][0].data;
    expect(paradas).toHaveLength(2);
    expect(paradas.find((d: any) => d.lead_id === LEAD(2))).toMatchObject({ candidate_id: 'cand1', name_snap: 'Bar 2', address_snap: 'Rua 2', day: DIA });
    expect(p.leads.create).not.toHaveBeenCalled();
    expect(p.leads.update).not.toHaveBeenCalled();
  });

  it('refaz sobre o roteiro existente: mantém visitada e pulada, descarta o que saiu e trava por version', async () => {
    const p = fakePrisma();
    const existente = rotaRow({
      stops: [stopRow(1, { status: 'visitada' }), stopRow(2, { status: 'pulada', skip_reason: 'fechado' }), stopRow(3), stopRow(4)],
    });
    p.field_routes.findFirst.mockResolvedValue(existente);
    p.field_routes.findUnique.mockResolvedValue(existente);
    p.field_route_stops.findMany.mockResolvedValue([]);
    // equipe agora escolhe 1, 2 (pulada), 3 e o novo 5; tira o 4
    p.leads.findMany.mockResolvedValue([lead(1), lead(2), lead(3), lead(5)]);
    await montar(p).build({ consultant_id: CONS_A, day: DIA, lead_ids: [LEAD(1), LEAD(2), LEAD(3), LEAD(5)] }, ADMIN, AGORA);
    expect(p.field_routes.create).not.toHaveBeenCalled();
    expect(p.field_routes.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: ROTA, version: 1 } }));
    const upd = p.field_route_stops.update.mock.calls.map((c: any[]) => [c[0].where.id, c[0].data.status]);
    expect(upd).toEqual(expect.arrayContaining([[STOP(4), 'descartada'], [STOP(3), 'pendente']]));
    expect(upd.map((u: string[]) => u[0])).not.toContain(STOP(1)); // visitada intacta
    expect(upd.map((u: string[]) => u[0])).not.toContain(STOP(2)); // pulada continua pulada
    expect(p.field_route_stops.create).toHaveBeenCalledWith({ data: expect.objectContaining({ lead_id: LEAD(5), name_snap: 'Bar 5' }) });
  });

  it('flag desligada: 404 ROUTES_DISABLED em tudo', async () => {
    const p = fakePrisma();
    const s = montar(p, false);
    for (const f of [
      () => s.list({}, AGORA),
      () => s.get(ROTA, AGORA),
      () => s.candidates({ praca_id: PRACA }, AGORA),
      () => s.build({ consultant_id: CONS_A, day: DIA, lead_ids: [LEAD(1)] }, ADMIN, AGORA),
      () => s.order(ROTA, { version: 1, stops: [{ id: STOP(1) }] }, ADMIN, AGORA),
      () => s.reoptimize(ROTA, {}, ADMIN, AGORA),
    ]) {
      expect(codigo(await falha(f))).toBe('ROUTES_DISABLED');
    }
  });
});

describe('RotasEquipeService.order', () => {
  it('versão desatualizada → 409 ROUTE_VERSION_CONFLICT', async () => {
    const p = fakePrisma();
    const e = await falha(() => montar(p).order(ROTA, { version: 7, stops: [{ id: STOP(1) }, { id: STOP(2) }, { id: STOP(3) }] }, ADMIN, AGORA));
    expect(codigo(e)).toBe('ROUTE_VERSION_CONFLICT');
  });

  it('exige todas as pendentes, uma vez cada', async () => {
    const p = fakePrisma();
    const s = montar(p);
    expect(codigo(await falha(() => s.order(ROTA, { version: 1, stops: [{ id: STOP(1) }] }, ADMIN, AGORA)))).toBe('VALIDATION_ERROR');
    expect(codigo(await falha(() => s.order(ROTA, { version: 1, stops: [{ id: STOP(1) }, { id: STOP(1) }, { id: STOP(3) }] }, ADMIN, AGORA)))).toBe('VALIDATION_ERROR');
  });

  it('reordena reaproveitando os seq das pendentes, grava fixa e recalcula o horário', async () => {
    const p = fakePrisma();
    await montar(p).order(ROTA, { version: 1, stops: [{ id: STOP(3), fixa: true }, { id: STOP(1) }, { id: STOP(2) }] }, ADMIN, AGORA);
    const por = new Map(p.field_route_stops.update.mock.calls.map((c: any[]) => [c[0].where.id, c[0].data]));
    expect(por.get(STOP(3))).toMatchObject({ seq: 1, fixa: true, kind: 'planejada' });
    expect(por.get(STOP(1))).toMatchObject({ seq: 2, fixa: false });
    expect(por.get(STOP(2))).toMatchObject({ seq: 3 });
    expect(p.field_routes.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: ROTA, version: 1 } }));
  });

  it('roteiro inexistente ou id malformado → 404', async () => {
    const p = fakePrisma();
    expect(await falha(() => montar(p).get('lixo', AGORA))).toBeInstanceOf(NotFoundException);
    p.field_routes.findUnique.mockResolvedValue(null);
    expect(await falha(() => montar(p).get(ROTA, AGORA))).toBeInstanceOf(NotFoundException);
  });
});

describe('RotasEquipeService.candidates', () => {
  it('só leads da praça informada, com localização exata, fora de roteiros do dia', async () => {
    const p = fakePrisma();
    p.field_areas.findMany.mockResolvedValue([{ id: AREA, praca_id: PRACA, lat: -23.6, lng: -46.66, radius_m: 2000 }]);
    p.leads.findMany.mockResolvedValue([
      { id: LEAD(1), name: 'A', address: '', lat: -23.6, lng: -46.66, stage: 1, source: 'osm' },
      { id: LEAD(2), name: 'B', address: '', lat: -23.6, lng: -46.66, stage: 1, source: null },
      { id: LEAD(3), name: 'C', address: '', lat: -22.0, lng: -46.66, stage: 1, source: null },
    ]);
    p.field_route_stops.findMany.mockResolvedValue([{ lead_id: LEAD(2) }]);
    p.place_candidates.findMany.mockResolvedValue([{ lead_id: LEAD(1), category: 'bar' }]);
    const r = await montar(p).candidates({ praca_id: PRACA }, AGORA);
    expect(p.leads.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ praca_id: PRACA, location_precision: { in: ['point', 'address'] } }) }),
    );
    expect(r.map((c) => c.id)).toEqual([LEAD(1)]); // 2 ocupado, 3 fora da área
    expect(r[0]).toMatchObject({ category: 'bar', source: 'osm', in_area: true });
  });

  it('área de outra praça → 404; praça inexistente → 404', async () => {
    const p = fakePrisma();
    expect(await falha(() => montar(p).candidates({ praca_id: PRACA, area_id: AREA }, AGORA))).toBeInstanceOf(NotFoundException);
    expect(p.field_areas.findMany).toHaveBeenCalledWith({ where: { praca_id: PRACA, id: AREA } });
    p.pracas.findUnique.mockResolvedValue(null);
    expect(await falha(() => montar(p).candidates({ praca_id: PRACA_B }, AGORA))).toBeInstanceOf(NotFoundException);
  });
});

describe('controllers — quem acessa o quê', () => {
  it('rotas do consultor têm @CampoRoute; as da equipe NÃO (token de consultor → 401)', () => {
    expect(Reflect.getMetadata(CAMPO_ROUTE_KEY, RotasCampoController)).toBe(true);
    expect(Reflect.getMetadata(CAMPO_ROUTE_KEY, RotasEquipeController)).toBeUndefined();
    expect(Reflect.getMetadata(CAMPO_ROUTE_KEY, RotasConfigController)).toBeUndefined();
  });
  it('escrita da equipe e da configuração é só admin; leitura não', () => {
    const marca = (C: any, m: string) => Reflect.getMetadata(ADMIN_ONLY_KEY, C.prototype[m]);
    for (const m of ['build', 'order', 'reoptimize']) expect(marca(RotasEquipeController, m)).toBe(true);
    for (const m of ['list', 'candidates', 'get']) expect(marca(RotasEquipeController, m)).toBeUndefined();
    expect(marca(RotasConfigController, 'put')).toBe(true);
    expect(marca(RotasConfigController, 'get')).toBeUndefined();
  });
});

describe('MontarRotaDto', () => {
  it('rejeita lista vazia, uuid inválido e dia inexistente', async () => {
    const ok = plainToInstance(MontarRotaDto, { consultant_id: CONS_A, day: DIA, lead_ids: [LEAD(1)] });
    expect(await validate(ok)).toHaveLength(0);
    for (const ruim of [{ lead_ids: [] }, { lead_ids: ['x'] }, { day: '2026-02-31' }, { consultant_id: 'x' }]) {
      expect((await validate(plainToInstance(MontarRotaDto, { consultant_id: CONS_A, day: DIA, lead_ids: [LEAD(1)], ...ruim }))).length).toBeGreaterThan(0);
    }
  });
});

describe('P0 §30.4 — modo de deslocamento a pé / de carro', () => {
  const longe = (n: number) => lead(n, { lat: -23.6 - n * 0.05 });
  const etasDe = (p: ReturnType<typeof fakePrisma>) =>
    Object.fromEntries(p.field_route_stops.createMany.mock.calls[0][0].data.map((d: any) => [d.lead_id, d.eta_min]));

  it('roteiro novo: sem travel_mode = a pé; com "carro" grava o modo, fotografa a velocidade e chega antes', async () => {
    const montarNovo = async (modo?: string) => {
      const p = fakePrisma();
      p.field_routes.findFirst.mockResolvedValueOnce(null);
      p.field_route_stops.findMany.mockResolvedValue([]);
      p.leads.findMany.mockResolvedValue([longe(1), longe(2), longe(3)]);
      await montar(p).build({ consultant_id: CONS_A, day: DIA, lead_ids: [LEAD(1), LEAD(2), LEAD(3)], ...(modo ? { travel_mode: modo } : {}) }, ADMIN, AGORA);
      return p;
    };
    const aPe = await montarNovo();
    const carro = await montarNovo('carro');
    expect(aPe.field_routes.create.mock.calls[0][0].data).toMatchObject({ travel_mode: 'a_pe' });
    expect(aPe.field_routes.create.mock.calls[0][0].data.params_snapshot.velocidade_carro_kmh).toBeNull();
    const dc = carro.field_routes.create.mock.calls[0][0].data;
    expect(dc).toMatchObject({ travel_mode: 'carro' });
    expect(dc.params_snapshot.velocidade_carro_kmh).toBe(25);
    expect(etasDe(carro)[LEAD(2)]).toBeLessThan(etasDe(aPe)[LEAD(2)]);
  });

  it('refazer sobre roteiro a pé escolhendo "carro" troca o modo, regrava a velocidade e sobe a versão', async () => {
    const p = fakePrisma();
    p.field_route_stops.findMany.mockResolvedValue([]);
    p.leads.findMany.mockResolvedValue([longe(1), longe(2), longe(3)]);
    await montar(p).build({ consultant_id: CONS_A, day: DIA, lead_ids: [LEAD(1), LEAD(2), LEAD(3)], travel_mode: 'carro' }, ADMIN, AGORA);
    const upd = p.field_routes.updateMany.mock.calls[0][0];
    expect(upd.where).toEqual({ id: ROTA, version: 1 });
    expect(upd.data).toMatchObject({ travel_mode: 'carro' });
    expect(upd.data.params_snapshot.velocidade_carro_kmh).toBe(25);
  });

  it('sem travel_mode, o roteiro de carro continua de carro (não volta a pé)', async () => {
    const p = fakePrisma();
    const existente = rotaRow({ travel_mode: 'carro', params_snapshot: { config: CONFIG_ROTA_PADRAO, velocidade_carro_kmh: 30, not_fit: 0, versoes: [] } });
    p.field_routes.findFirst.mockResolvedValue(existente);
    p.field_routes.findUnique.mockResolvedValue(existente);
    p.field_route_stops.findMany.mockResolvedValue([]);
    p.leads.findMany.mockResolvedValue([longe(1), longe(2), longe(3)]);
    await montar(p).build({ consultant_id: CONS_A, day: DIA, lead_ids: [LEAD(1), LEAD(2), LEAD(3)] }, ADMIN, AGORA);
    const upd = p.field_routes.updateMany.mock.calls[0][0];
    expect(upd.data).not.toHaveProperty('travel_mode');
    expect(upd.data.params_snapshot.velocidade_carro_kmh).toBe(30); // fotografada, não a do env
  });

  it('reordenar um roteiro de carro usa a velocidade de carro (não a de caminhada)', async () => {
    const longes = [1, 2, 3].map((n) => stopRow(n, { lat_snap: -23.6 - n * 0.05 }));
    const etas = async (modo: string) => {
      const p = fakePrisma();
      const r = rotaRow({ travel_mode: modo, stops: longes, params_snapshot: { config: CONFIG_ROTA_PADRAO, velocidade_carro_kmh: 25, not_fit: 0, versoes: [] } });
      p.field_routes.findUnique.mockResolvedValue(r);
      await montar(p).order(ROTA, { version: 1, stops: [{ id: STOP(1) }, { id: STOP(2) }, { id: STOP(3) }] }, ADMIN, AGORA);
      return new Map(p.field_route_stops.update.mock.calls.map((c: any[]) => [c[0].where.id, c[0].data.eta_min]));
    };
    const [aPe, carro] = [await etas('a_pe'), await etas('carro')];
    expect(carro.get(STOP(3))! as number).toBeLessThan(aPe.get(STOP(3))! as number);
  });

  it('a leitura do roteiro traz o modo e a conta escrita; "fechado" fica fora do feito da meta', async () => {
    const p = fakePrisma();
    const r = rotaRow({
      travel_mode: 'carro',
      params_snapshot: { config: CONFIG_ROTA_PADRAO, velocidade_carro_kmh: 25, not_fit: 0, versoes: [] },
      stops: [stopRow(1, { status: 'visitada', visit: { outcome: 'conversa' } }), stopRow(2, { status: 'visitada', visit: { outcome: 'fechado' } }), stopRow(3)],
    });
    p.field_routes.findUnique.mockResolvedValue(r);
    const v = await montar(p).get(ROTA, AGORA);
    expect(v.travel_mode).toBe('carro');
    expect(v.travel).toMatchObject({ mode: 'carro', speed_kmh: 25, detour_factor: 1.3 });
    expect(v.travel.text).toBe('De carro: 25 km/h × desvio de rua 1,3 (média urbana, sem estacionar)');
    expect(v.progress.done).toBe(1);
    expect(v.stops.filter((s) => s.status === 'visitada')).toHaveLength(2); // a parada segue visitada: não trava o roteiro
  });

  it('DTO: travel_mode só aceita a_pe | carro e não tem default', async () => {
    const ok = plainToInstance(MontarRotaDto, { consultant_id: CONS_A, day: DIA, lead_ids: [LEAD(1)], travel_mode: 'carro' });
    expect(await validate(ok)).toHaveLength(0);
    const sem = plainToInstance(MontarRotaDto, { consultant_id: CONS_A, day: DIA, lead_ids: [LEAD(1)] });
    expect(sem.travel_mode).toBeUndefined();
    const ruim = plainToInstance(MontarRotaDto, { consultant_id: CONS_A, day: DIA, lead_ids: [LEAD(1)], travel_mode: 'moto' });
    expect((await validate(ruim)).map((e) => e.property)).toContain('travel_mode');
  });
});
