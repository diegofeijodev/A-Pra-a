/**
 * Lote F2 (contrato §44.7): `POST /v1/routes` (e a publicação dos planos, que chama o mesmo serviço) com o consultor em várias
 * praças. Todos os leads numa mesma praça do conjunto, que vira a praça do roteiro; com a flag desligada, a regra de hoje.
 */
import 'reflect-metadata';
import type { AuthUser } from '../../../common/auth/auth-user';
import type { PrismaService } from '../../../common/database/prisma.service';
import { PracasDoConsultorService } from '../../../common/pracas/pracas-do-consultor.service';
import { CONFIG_ROTA_PADRAO } from '../../../domain/rota-rules';
import type { RotasConfigService } from '../rotas-config.service';
import { PlanosService } from '../planos/planos.service';
import { RotasEquipeService } from '../rotas-equipe.service';
import { AGORA, CONS_A, DIA, fakePrisma, LEAD, PRACA, PRACA_B, rotaRow, stopRow } from './fixtures';

const ADMIN: AuthUser = { id: '00000000-0000-4000-8000-0000000000dd', email: 'a@a.com', name: 'A', is_admin: true };
const AREA_B = '00000000-0000-4000-8000-0000000000cb';
const PRACA_C = '00000000-0000-4000-8000-0000000000cc';
const lead = (n: number, praca_id: string) => ({ id: LEAD(n), name: `Bar ${n}`, address: `Rua ${n}`, phone: '', lat: -23.6 + n * 0.001, lng: -46.66, praca_id, archived: false });
const falha = async (f: () => Promise<unknown>) => f().then(() => null, (e: unknown) => e);
const resposta = (e: unknown) => (e as { getResponse: () => { code: string; message: string } }).getResponse();

function montar(p: ReturnType<typeof fakePrisma>, ligado: boolean, extras: string[] = [PRACA_B]) {
  p.field_consultant_pracas = { findMany: jest.fn().mockResolvedValue(extras.map((praca_id) => ({ praca_id }))) };
  const configs = { config: jest.fn().mockResolvedValue(CONFIG_ROTA_PADRAO) } as unknown as RotasConfigService;
  const pracas = new PracasDoConsultorService(p as unknown as PrismaService, ligado);
  return new RotasEquipeService(p as unknown as PrismaService, configs, true, undefined, undefined, pracas);
}

describe('POST /v1/routes com várias praças (§44.7)', () => {
  it('ligada: leads todos em B (no conjunto) = roteiro em B; a área tem de ser de B', async () => {
    const p = fakePrisma();
    p.field_routes.findFirst.mockResolvedValue(null);
    p.field_route_stops.findMany.mockResolvedValue([]);
    p.leads.findMany.mockResolvedValue([lead(1, PRACA_B), lead(2, PRACA_B)]);
    p.field_areas.findFirst.mockResolvedValue({ id: AREA_B, lat: -23.6, lng: -46.66, radius_m: 800 });
    await montar(p, true).build({ consultant_id: CONS_A, day: DIA, lead_ids: [LEAD(1), LEAD(2)], area_id: AREA_B }, ADMIN, AGORA);
    expect(p.field_areas.findFirst).toHaveBeenCalledWith({ where: { id: AREA_B, praca_id: PRACA_B } });
    expect(p.field_routes.create.mock.calls[0][0].data).toMatchObject({ consultant_id: CONS_A, praca_id: PRACA_B });
  });

  it('ligada: leads de A e de B juntos = 400 "uma praça só"', async () => {
    const p = fakePrisma();
    p.leads.findMany.mockResolvedValue([lead(1, PRACA), lead(2, PRACA_B)]);
    const e = await falha(() => montar(p, true).build({ consultant_id: CONS_A, day: DIA, lead_ids: [LEAD(1), LEAD(2)] }, ADMIN, AGORA));
    expect(resposta(e)).toEqual({ code: 'VALIDATION_ERROR', message: 'lead_ids: os estabelecimentos precisam ser de uma praça só.' });
    expect(p.$transaction).not.toHaveBeenCalled();
  });

  it('ligada: lead de praça fora do conjunto = 400 com a frase de hoje (não revela se existe)', async () => {
    const p = fakePrisma();
    p.leads.findMany.mockResolvedValue([lead(1, PRACA_C)]);
    const e = await falha(() => montar(p, true).build({ consultant_id: CONS_A, day: DIA, lead_ids: [LEAD(1)] }, ADMIN, AGORA));
    expect(resposta(e).message).toBe('lead_ids: um ou mais estabelecimentos não existem ou não pertencem à praça do consultor.');
  });

  it('desligada: lead de B (mesmo na junção) = 400 como hoje, e a junção nem é lida', async () => {
    const p = fakePrisma();
    p.leads.findMany.mockResolvedValue([lead(1, PRACA_B)]);
    const e = await falha(() => montar(p, false).build({ consultant_id: CONS_A, day: DIA, lead_ids: [LEAD(1)] }, ADMIN, AGORA));
    expect(resposta(e).code).toBe('VALIDATION_ERROR');
    expect(p.field_consultant_pracas.findMany).not.toHaveBeenCalled();
  });

  it('ligada: roteiro do dia em A sem visita passa para B na mesma gravação', async () => {
    const p = fakePrisma();
    const existente = rotaRow({ praca_id: PRACA, stops: [stopRow(1), stopRow(2)] });
    p.field_routes.findFirst.mockResolvedValue(existente);
    p.field_routes.findUnique.mockResolvedValue(existente);
    p.field_route_stops.findMany.mockResolvedValue([]);
    p.leads.findMany.mockResolvedValue([lead(5, PRACA_B)]);
    await montar(p, true).build({ consultant_id: CONS_A, day: DIA, lead_ids: [LEAD(5)] }, ADMIN, AGORA);
    expect(p.field_routes.update).toHaveBeenCalledWith({ where: { id: existente.id }, data: { praca_id: PRACA_B } });
  });

  it('ligada: roteiro do dia em A COM visita = 400 com a praça e o dia', async () => {
    const p = fakePrisma();
    const existente = rotaRow({ praca_id: PRACA, stops: [stopRow(1, { status: 'visitada' })] });
    p.field_routes.findFirst.mockResolvedValue(existente);
    p.field_route_stops.findMany.mockResolvedValue([]);
    p.pracas.findUnique.mockResolvedValue({ name: 'Moema' });
    p.leads.findMany.mockResolvedValue([lead(5, PRACA_B)]);
    const e = await falha(() => montar(p, true).build({ consultant_id: CONS_A, day: DIA, lead_ids: [LEAD(5)] }, ADMIN, AGORA));
    expect(resposta(e).message).toBe(`lead_ids: o roteiro de ${DIA.slice(8, 10)}/${DIA.slice(5, 7)} já tem visitas em Moema.`);
    expect(p.$transaction).not.toHaveBeenCalled();
  });
});

describe('publicar um plano para quem atua na praça do plano (§44.7)', () => {
  const PLANO = '88888888-8888-4888-8888-888888888888';
  const ITEM = '88888888-8888-4888-8888-000000000001';
  // Plano da praça B; a Ana tem A como principal e B no conjunto.
  function montarPlano(ligado: boolean) {
    const item = { id: ITEM, plan_id: PLANO, seq: 1, name: 'Rota 01', color: '#2563eb', lead_ids: [LEAD(1)], assigned_route_id: null, assigned_consultant_id: null, assigned_day: null, assigned_at: null, assigned_by: null };
    const p = {
      field_route_plans: { findUnique: jest.fn().mockResolvedValue({ id: PLANO, praca_id: PRACA_B, area_id: null, kind: 'geral', travel_mode: 'a_pe', archived_at: null, items: [item] }) },
      field_consultants: { findUnique: jest.fn().mockResolvedValue({ id: CONS_A, name: 'Ana', praca_id: PRACA }) },
      field_consultant_pracas: { findMany: jest.fn().mockResolvedValue([{ praca_id: PRACA_B }]) },
      field_routes: { findFirst: jest.fn().mockResolvedValue(null) },
      leads: { findMany: jest.fn().mockResolvedValue([{ id: LEAD(1) }]) },
      field_route_plan_items: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const rotas = { build: jest.fn().mockResolvedValue({ id: 'r1' }), get: jest.fn() };
    const configs = { config: jest.fn().mockResolvedValue(CONFIG_ROTA_PADRAO) } as unknown as RotasConfigService;
    const s = new PlanosService(p as unknown as PrismaService, configs, rotas as never, { route_plans: true, malls: false }, undefined, new PracasDoConsultorService(p as unknown as PrismaService, ligado));
    // `get` do item depois de publicar (só a forma importa aqui).
    jest.spyOn(s, 'get').mockResolvedValue({ items: [{ id: ITEM }] } as never);
    return { s, rotas };
  }
  it('ligada: aceita (B está no conjunto) e chama o MESMO build', async () => {
    const { s, rotas } = montarPlano(true);
    await s.atribuir(PLANO, ITEM, { consultant_id: CONS_A, day: DIA }, ADMIN, AGORA);
    expect(rotas.build).toHaveBeenCalled();
  });
  it('desligada: "o consultor é de outra praça" como hoje', async () => {
    const { s, rotas } = montarPlano(false);
    const e = await falha(() => s.atribuir(PLANO, ITEM, { consultant_id: CONS_A, day: DIA }, ADMIN, AGORA));
    expect(resposta(e).message).toBe('consultant_id: o consultor é de outra praça.');
    expect(rotas.build).not.toHaveBeenCalled();
  });
});
