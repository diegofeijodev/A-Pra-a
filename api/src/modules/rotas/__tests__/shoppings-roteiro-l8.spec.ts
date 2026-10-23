/**
 * Lote D da Lovable, L8 (contrato §40.3, §40.6): o shopping fica fora da cadência automática e da rota geral só com a flag ligada;
 * desligada, a consulta da inscrição automática, dos candidatos e da seleção automática do roteiro é a de hoje (nenhuma chave nova).
 */
import 'reflect-metadata';
import type { PrismaService } from '../../../common/database/prisma.service';
import { CONFIG_ROTA_PADRAO } from '../../../domain/rota-rules';
import { CONFIG_SHOPPING } from '../../../domain/shopping-rules';
import { CadenceEngineService } from '../../cadences/cadence-engine.service';
import type { MessagesService } from '../../messages/messages.service';
import { CandidatosQueryDto } from '../dto/rotas.dto';
import type { RotasConfigService } from '../rotas-config.service';
import { RotasCampoService } from '../rotas-campo.service';
import { RotasEquipeService } from '../rotas-equipe.service';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AGORA, fakePrisma, PRACA } from './fixtures';

const AREA = '00000000-0000-4000-8000-0000000000cc';
const MALL = '33333333-3333-4333-8333-333333333333';
const configs = (shopping = CONFIG_SHOPPING.padrao) =>
  ({ config: jest.fn().mockResolvedValue(CONFIG_ROTA_PADRAO), shopping: jest.fn().mockResolvedValue(shopping) }) as unknown as RotasConfigService;

describe('cadência: o lead do shopping não entra sozinho (só com a flag)', () => {
  async function whereDaInscricao(malls: boolean | undefined) {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = { leads: { findMany } } as unknown as PrismaService;
    const svc = new CadenceEngineService(prisma, {} as MessagesService, malls === undefined ? undefined : { route_plans: true, malls });
    const cad = { id: 'c1', entry: 'stage_novo', nodes: [{ id: 'n1', kind: 'msg' }] };
    await (svc as unknown as { autoEnroll: (c: unknown, st: unknown) => Promise<void> }).autoEnroll(cad, { hoje: '2026-10-22' });
    return findMany.mock.calls[0][0].where;
  }
  it('desligada (ou sem o provedor): a consulta de hoje, sem chave nova', async () => {
    const hoje = { archived: false, is_test: false, stage: 1, enrollments: { none: { cadence_id: 'c1' } } };
    expect(await whereDaInscricao(false)).toEqual(hoje);
    expect(await whereDaInscricao(undefined)).toEqual(hoje);
  });
  it('ligada: place_kind nulo (as lojas de dentro entram como qualquer lead)', async () => {
    expect(await whereDaInscricao(true)).toMatchObject({ place_kind: null });
    expect(await whereDaInscricao(true)).not.toHaveProperty('parent_lead_id');
  });
});

describe('candidatos da equipe: scope', () => {
  function equipe(malls: boolean, shopping = CONFIG_SHOPPING.padrao) {
    const p = fakePrisma();
    p.field_areas.findMany.mockResolvedValue([{ id: AREA, praca_id: PRACA, lat: -23.6, lng: -46.66, radius_m: 2000 }]);
    p.leads.findMany.mockResolvedValue([]);
    const s = new RotasEquipeService(p as unknown as PrismaService, configs(shopping), true, undefined, { route_plans: true, malls });
    return { s, p };
  }
  it('sem scope: a consulta de hoje (mesmo com a flag ligada)', async () => {
    for (const malls of [false, true]) {
      const { s, p } = equipe(malls);
      await s.candidates({ praca_id: PRACA }, AGORA);
      const where = p.leads.findMany.mock.calls[0][0].where;
      expect(where).not.toHaveProperty('place_kind');
      expect(where).not.toHaveProperty('parent_lead_id');
    }
  });
  it('scope com a flag desligada = 404 MALLS_DISABLED', async () => {
    const { s } = equipe(false);
    await expect(s.candidates({ praca_id: PRACA, scope: 'geral' }, AGORA)).rejects.toMatchObject({ status: 404, response: { code: 'MALLS_DISABLED' } });
  });
  it('geral tira shoppings e lojas (fora_da_rota_geral); shoppings = só eles; shopping:<id> = as lojas dele', async () => {
    const casos: [string, Record<string, unknown>][] = [
      ['geral', { place_kind: null, parent_lead_id: null }],
      ['shoppings', { place_kind: 'shopping' }],
      [`shopping:${MALL}`, { parent_lead_id: MALL }],
    ];
    for (const [scope, esperado] of casos) {
      const { s, p } = equipe(true);
      await s.candidates({ praca_id: PRACA, scope }, AGORA);
      expect(p.leads.findMany.mock.calls[0][0].where).toMatchObject(esperado);
    }
    const { s, p } = equipe(true, { ...CONFIG_SHOPPING.padrao, fora_da_rota_geral: false });
    await s.candidates({ praca_id: PRACA, scope: 'geral' }, AGORA);
    expect(p.leads.findMany.mock.calls[0][0].where).not.toHaveProperty('place_kind');
  });
  it('DTO: scope só geral | shoppings | shopping:<uuid>', async () => {
    const erros = async (scope: string) => (await validate(plainToInstance(CandidatosQueryDto, { praca_id: PRACA, scope }))).length;
    expect(await erros('geral')).toBe(0);
    expect(await erros(`shopping:${MALL}`)).toBe(0);
    expect(await erros('shopping:1; drop')).toBe(1);
    expect(await erros('todos')).toBe(1);
  });
});

describe('seleção automática do roteiro (gerar ao iniciar / Montar meu dia)', () => {
  async function whereDaSelecao(malls: boolean) {
    const p = fakePrisma();
    p.field_areas.findMany.mockResolvedValue([{ id: AREA, praca_id: PRACA, lat: -23.6, lng: -46.66, radius_m: 2000 }]);
    p.leads.findMany.mockResolvedValue([]);
    const s = new RotasCampoService(p as unknown as PrismaService, configs(), true, undefined, undefined, { route_plans: true, malls });
    await (s as unknown as { elegiveis: (pr: string, c: unknown, a: Date) => Promise<unknown> }).elegiveis(PRACA, CONFIG_ROTA_PADRAO, AGORA);
    return p.leads.findMany.mock.calls[0][0].where;
  }
  it('desligada: idêntica à de hoje; ligada: sem shoppings e lojas de dentro', async () => {
    const off = await whereDaSelecao(false);
    expect(Object.keys(off)).toEqual(['praca_id', 'archived', 'is_test', 'stage', 'declared_signups', 'location_precision', 'OR']);
    expect(await whereDaSelecao(true)).toMatchObject({ place_kind: null, parent_lead_id: null });
  });
});
